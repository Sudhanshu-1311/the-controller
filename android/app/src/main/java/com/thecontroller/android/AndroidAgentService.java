package com.thecontroller.android;

import android.app.*;
import android.content.*;
import android.net.*;
import android.os.*;
import android.util.Log;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class AndroidAgentService extends Service {
    static final String ACTION_START = "com.thecontroller.android.START";
    static final String ACTION_STOP = "com.thecontroller.android.STOP";
    static final String ACTION_SETTINGS = "com.thecontroller.android.SETTINGS";
    static final String ACTION_STATE = "com.thecontroller.android.STATE";
    static final String CHANNEL = "controller_agent";
    private static final String TAG = "ControllerAgent";
    private static final int NOTIFICATION_ID = 14;
    private final AtomicBoolean stopping = new AtomicBoolean(false);
    private final Object wakeLock = new Object();
    private volatile boolean awakened = false;
    private volatile String idToken;
    private volatile long tokenExpiry;
    private Thread worker;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile boolean clearCredentialsOnStop = false;

    static void start(Context context) {
        Intent intent = new Intent(context, AndroidAgentService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent); else context.startService(intent);
    }
    static void stop(Context context) { context.startService(new Intent(context, AndroidAgentService.class).setAction(ACTION_STOP)); }
    static void clearCredentials(Context context) { context.startService(new Intent(context, AndroidAgentService.class).setAction(ACTION_STOP).putExtra("clearCredentials", true)); }
    static void settingsChanged(Context context) { context.startService(new Intent(context, AndroidAgentService.class).setAction(ACTION_SETTINGS)); }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, notification("Starting secure device agent…", false));
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { wake(); }
            @Override public void onLost(Network network) { updateState("RECONNECTING", "Network interrupted"); wake(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { wake(); }
        };
        try { cm.registerDefaultNetworkCallback(networkCallback); } catch (Exception e) { Log.w(TAG, "Network callback unavailable", e); }
        stopping.set(false);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { clearCredentialsOnStop = intent != null && intent.getBooleanExtra("clearCredentials", false); stopAgent(); return START_NOT_STICKY; }
        if (ACTION_SETTINGS.equals(action)) { wake(); return START_STICKY; }
        if (worker == null || !worker.isAlive()) {
            stopping.set(false);
            worker = new Thread(this::runAgent, "controller-android-agent");
            worker.start();
        } else wake();
        return START_STICKY;
    }

    private void runAgent() {
        int failures = 0;
        long lastHeartbeat = 0;
        String lastPresence = null;
        boolean registered = false;
        while (!stopping.get()) {
            try {
                JSONObject credentials = getCredentials();
                if (credentials == null) {
                    updateState("OFFLINE", "Sign in to enable the agent");
                    sleep(5000);
                    continue;
                }
                if (idToken == null || System.currentTimeMillis() > tokenExpiry - 240_000) refreshAuth(credentials);
                JSONObject config = credentials.getJSONObject("firebaseConfig");
                String uid = credentials.getString("uid");
                JSONObject settings = getSettings();
                if (!registered) {
                    updateState("REGISTERING", "Registering device and checking authenticated signaling");
                    writePresence(config, uid, settings, "REGISTERING");
                }
                JSONObject query = new JSONObject().put("structuredQuery", new JSONObject()
                    .put("from", new JSONArray().put(new JSONObject().put("collectionId", "signals")))
                    .put("where", new JSONObject().put("fieldFilter", new JSONObject()
                        .put("field", new JSONObject().put("fieldPath", "targetId"))
                        .put("op", "EQUAL").put("value", new JSONObject().put("stringValue", localAgentId()))))
                    .put("limit", 50));
                JSONArray signals = new JSONArray(http("POST", firestore(config, "documents:runQuery"), query.toString(), idToken));
                showIncomingRequests(signals);
                String status = settings.optBoolean("pauseRemoteAccess") || !settings.optBoolean("allowRemoteConnections", true)
                    ? "REMOTE_ACCESS_PAUSED" : "ONLINE";
                if (lastPresence == null || !lastPresence.equals(status) || System.currentTimeMillis() - lastHeartbeat >= 30_000) {
                    writePresence(config, uid, settings, status);
                    lastHeartbeat = System.currentTimeMillis();
                    lastPresence = status;
                }
                registered = true;
                updateState(status, "Authenticated Firebase presence and signaling are active");
                failures = 0;
                sleep(5000);
            } catch (Exception error) {
                String previousToken = idToken;
                idToken = previousToken;
                try {
                    JSONObject credentials = getCredentials();
                    if (credentials != null && previousToken != null && System.currentTimeMillis() < tokenExpiry) {
                        writePresence(credentials.getJSONObject("firebaseConfig"), credentials.getString("uid"), getSettings(), "RECONNECTING");
                        lastPresence = "RECONNECTING";
                    }
                } catch (Exception ignored) {}
                idToken = null;
                registered = false;
                failures++;
                updateState(failures >= 6 ? "OFFLINE" : "RECONNECTING", safeMessage(error));
                long delay = failures <= 5 ? Math.min(60_000L, 2_000L << (failures - 1)) : 300_000L;
                sleep(delay);
            }
        }
    }

    private void refreshAuth(JSONObject credentials) throws Exception {
        updateState("AUTHENTICATING", "Refreshing encrypted Firebase credentials");
        JSONObject config = credentials.getJSONObject("firebaseConfig");
        String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(credentials.getString("refreshToken"), "UTF-8");
        JSONObject result = new JSONObject(http("POST", "https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(config.getString("apiKey"), "UTF-8"), body, null));
        if (!credentials.getString("uid").equals(result.getString("user_id"))) throw new IOException("Firebase credential identity mismatch");
        idToken = result.getString("id_token");
        tokenExpiry = System.currentTimeMillis() + result.optLong("expires_in", 3600) * 1000;
    }

    private void writePresence(JSONObject config, String uid, JSONObject settings, String state) throws Exception {
        JSONObject identity = getIdentity();
        JSONObject fields = new JSONObject()
            .put("identity", map(identity)).put("ownerUid", string(uid)).put("name", string(settings.optString("deviceName", Build.MANUFACTURER + " " + Build.MODEL)))
            .put("role", string("agent")).put("status", string("Offline")).put("presenceState", string(state))
            .put("lastSeen", new JSONObject().put("integerValue", String.valueOf(System.currentTimeMillis())))
            .put("remoteAccessPaused", bool(settings.optBoolean("pauseRemoteAccess")))
            .put("allowRemoteConnections", bool(settings.optBoolean("allowRemoteConnections", true)))
            .put("authorizedControllerUids", array(settings.optJSONArray("authorizedControllerUids")));
        String id = URLEncoder.encode(localAgentId(), "UTF-8");
        String url = firestore(config, "documents/devices/" + id) + "?" +
            "updateMask.fieldPaths=identity&updateMask.fieldPaths=ownerUid&updateMask.fieldPaths=name&updateMask.fieldPaths=role" +
            "&updateMask.fieldPaths=status&updateMask.fieldPaths=presenceState&updateMask.fieldPaths=lastSeen" +
            "&updateMask.fieldPaths=remoteAccessPaused&updateMask.fieldPaths=allowRemoteConnections&updateMask.fieldPaths=authorizedControllerUids";
        http("PATCH", url, new JSONObject().put("fields", fields).toString(), idToken);
    }

    private void showIncomingRequests(JSONArray signals) throws Exception {
        Set<String> alerted = getSharedPreferences("agent", MODE_PRIVATE).getStringSet("alertedSignals", new HashSet<>());
        Set<String> next = new HashSet<>(alerted);
        for (int i = 0; i < signals.length(); i++) {
            JSONObject doc = signals.optJSONObject(i);
            if (doc == null) continue;
            JSONObject document = doc.optJSONObject("document");
            if (document == null) continue;
            String name = document.optString("name");
            String signalId = name.substring(name.lastIndexOf('/') + 1);
            JSONObject msg = firestoreValue(document.optJSONObject("fields") == null ? null : document.optJSONObject("fields").optJSONObject("message"));
            if (msg != null && "CONNECT_REQUEST".equals(msg.optString("type")) && !next.contains(signalId)) {
                next.add(signalId);
                Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pending = PendingIntent.getActivity(this, 40, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Notification n = new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_warning)
                    .setContentTitle("THE CONTROLLER").setContentText("Remote session request — tap to review")
                    .setContentIntent(pending).setAutoCancel(true).build();
                ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1000 + Math.abs(signalId.hashCode() % 50000), n);
            }
        }
        getSharedPreferences("agent", MODE_PRIVATE).edit().putStringSet("alertedSignals", next).apply();
    }

    private JSONObject firestoreValue(JSONObject value) throws Exception {
        if (value == null) return null;
        if (value.has("stringValue")) return new JSONObject().put("value", value.getString("stringValue"));
        if (value.has("booleanValue")) return new JSONObject().put("value", value.getBoolean("booleanValue"));
        if (value.has("mapValue")) {
            JSONObject fields = value.getJSONObject("mapValue").optJSONObject("fields");
            JSONObject out = new JSONObject();
            if (fields != null) { java.util.Iterator<String> keys = fields.keys(); while (keys.hasNext()) { String key = keys.next(); JSONObject decoded = firestoreValue(fields.optJSONObject(key)); if (decoded != null) out.put(key, decoded.opt("value")); } }
            return out;
        }
        return null;
    }

    private JSONObject getCredentials() {
        try {
            String encrypted = getSharedPreferences("agent", MODE_PRIVATE).getString("credentials", null);
            return encrypted == null ? null : new JSONObject(SecureStore.decrypt(encrypted));
        } catch (Exception error) { Log.w(TAG, "Could not read secure credentials", error); return null; }
    }
    private JSONObject getIdentity() throws Exception { return new JSONObject(getSharedPreferences("agent", MODE_PRIVATE).getString("identity", "{}")); }
    private String localAgentId() throws Exception { return getIdentity().getString("id"); }
    private JSONObject getSettings() {
        try { return new JSONObject(getSharedPreferences("agent", MODE_PRIVATE).getString("settings", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }
    private String firestore(JSONObject config, String path) throws Exception {
        return "https://firestore.googleapis.com/v1/projects/" + config.getString("projectId") + "/databases/(default)/" + path;
    }

    private String http(String method, String url, String body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method); connection.setConnectTimeout(12_000); connection.setReadTimeout(12_000);
        connection.setRequestProperty("Accept", "application/json");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) {
            connection.setDoOutput(true); connection.setRequestProperty("Content-Type", body.startsWith("grant_type=") ? "application/x-www-form-urlencoded" : "application/json");
            try (OutputStream out = connection.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = connection.getResponseCode();
        InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
        String response = "";
        if (stream != null) try (InputStream in = stream; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] bytes = new byte[8192]; int count; while ((count = in.read(bytes)) != -1) buffer.write(bytes, 0, count);
            response = buffer.toString("UTF-8");
        }
        connection.disconnect();
        if (code < 200 || code >= 300) throw new IOException("Backend HTTP " + code + (response.isEmpty() ? "" : ": " + response.substring(0, Math.min(response.length(), 240))));
        return response;
    }

    private JSONObject string(String value) throws Exception { return new JSONObject().put("stringValue", value); }
    private JSONObject bool(boolean value) throws Exception { return new JSONObject().put("booleanValue", value); }
    private JSONObject map(JSONObject object) throws Exception {
        JSONObject fields = new JSONObject();
        java.util.Iterator<String> keys = object.keys();
        while (keys.hasNext()) { String key = keys.next(); fields.put(key, stringOrNumber(object.opt(key))); }
        return new JSONObject().put("mapValue", new JSONObject().put("fields", fields));
    }
    private JSONObject stringOrNumber(Object value) throws Exception {
        if (value instanceof Number) return new JSONObject().put("integerValue", String.valueOf(((Number) value).longValue()));
        return string(String.valueOf(value));
    }
    private JSONObject array(JSONArray values) throws Exception {
        JSONArray out = new JSONArray();
        if (values != null) for (int i = 0; i < values.length(); i++) out.put(string(values.optString(i)));
        return new JSONObject().put("arrayValue", new JSONObject().put("values", out));
    }

    private void updateState(String state, String details) {
        getSharedPreferences("agent", MODE_PRIVATE).edit().putString("state", state).putString("details", details).apply();
        Intent event = new Intent(ACTION_STATE).setPackage(getPackageName()).putExtra("state", state).putExtra("details", details);
        sendBroadcast(event);
        boolean paused = "REMOTE_ACCESS_PAUSED".equals(state);
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, notification(paused ? "Remote access is paused" : "Device status: " + state, true));
    }
    private Notification notification(String text, boolean ongoing) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_upload_done)
            .setContentTitle("THE CONTROLLER").setContentText(text).setContentIntent(pending).setOngoing(ongoing).build();
    }
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
            .createNotificationChannel(new NotificationChannel(CHANNEL, "Remote availability", NotificationManager.IMPORTANCE_LOW));
    }
    private void wake() { synchronized (wakeLock) { awakened = true; wakeLock.notifyAll(); } }
    private void sleep(long ms) {
        synchronized (wakeLock) { if (!awakened && !stopping.get()) try { wakeLock.wait(ms); } catch (InterruptedException ignored) {} awakened = false; }
    }
    private String safeMessage(Exception e) { String m = e.getMessage(); return m == null ? "Backend connection interrupted" : m.replaceAll("(?i)(token|key|refresh_token)=[^& ]+", "$1=[redacted]"); }
    private void stopAgent() {
        if (!stopping.compareAndSet(false, true)) return;
        wake();
        new Thread(() -> {
            if (worker != null && worker != Thread.currentThread()) try { worker.join(13_000); } catch (InterruptedException ignored) {}
            try {
                JSONObject creds = getCredentials();
                if (creds != null && (idToken == null || System.currentTimeMillis() >= tokenExpiry)) refreshAuth(creds);
                if (creds != null && idToken != null) {
                    JSONObject config = creds.getJSONObject("firebaseConfig");
                    writePresence(config, creds.getString("uid"), getSettings(), "OFFLINE");
                }
            } catch (Exception e) { Log.i(TAG, "Offline update unavailable; backend expiry will clear stale presence"); }
            if (clearCredentialsOnStop) getSharedPreferences("agent", MODE_PRIVATE).edit().remove("credentials").apply();
            updateState("OFFLINE", "Background agent stopped");
            new Handler(Looper.getMainLooper()).post(() -> { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); });
        }, "controller-agent-stop").start();
    }
    @Override public void onTaskRemoved(Intent rootIntent) { super.onTaskRemoved(rootIntent); /* User swipe does not stop the opted-in foreground agent. */ }
    @Override public void onDestroy() {
        stopping.set(true); wake();
        if (networkCallback != null) try { ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
