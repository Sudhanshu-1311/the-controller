package com.thecontroller.android;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

import org.json.JSONObject;

import java.util.UUID;

public final class AndroidHost {
    private static final int GOOGLE_SIGN_IN_REQUEST = 9001;

    private final MainActivity activity;
    private final Context context;

    AndroidHost(MainActivity activity) {
        this.activity = activity;
        this.context = activity.getApplicationContext();
    }

    @JavascriptInterface
    public String getIdentityJson() {
        android.content.SharedPreferences prefs =
                context.getSharedPreferences("agent", Context.MODE_PRIVATE);

        String old = prefs.getString("identity", null);
        if (old != null) return old;

        try {
            String id = UUID.randomUUID().toString();
            String fingerprint =
                    "FP-" + UUID.randomUUID().toString()
                            .replace("-", "")
                            .substring(0, 16)
                            .toUpperCase();

            JSONObject identity = new JSONObject()
                    .put("id", id)
                    .put("fingerprint", fingerprint)
                    .put("registeredAt", System.currentTimeMillis());

            prefs.edit()
                    .putString("identity", identity.toString())
                    .apply();

            return identity.toString();
        } catch (Exception error) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String getSettingsJson() {
        return context.getSharedPreferences("agent", Context.MODE_PRIVATE)
                .getString(
                        "settings",
                        "{\"keepRunningOnClose\":true,\"startWithWindows\":false,\"allowRemoteConnections\":true,\"pauseRemoteAccess\":false,\"authorizedDevices\":[],\"authorizedControllerUids\":[]}"
                );
    }

    @JavascriptInterface
    public String getStatusJson() {
        android.content.SharedPreferences p =
                context.getSharedPreferences("agent", Context.MODE_PRIVATE);

        try {
            return new JSONObject()
                    .put("state", p.getString("state", "OFFLINE"))
                    .put(
                            "details",
                            p.getString(
                                    "details",
                                    "Open the app and sign in to enable background access"
                            )
                    )
                    .toString();
        } catch (Exception e) {
            return "{\"state\":\"OFFLINE\"}";
        }
    }

    @JavascriptInterface
    public String setCredentials(String value) {
        try {
            JSONObject credentials = new JSONObject(value);
            String encrypted = SecureStore.encrypt(credentials.toString());

            context.getSharedPreferences("agent", Context.MODE_PRIVATE)
                    .edit()
                    .putString("credentials", encrypted)
                    .apply();

            AndroidAgentService.start(context);
            return "true";
        } catch (Exception error) {
            return "false";
        }
    }

    @JavascriptInterface
    public String clearCredentials() {
        AndroidAgentService.clearCredentials(context);
        return "true";
    }

    @JavascriptInterface
    public String updateSettings(String value) {
        try {
            JSONObject updates = new JSONObject(value);

            android.content.SharedPreferences prefs =
                    context.getSharedPreferences("agent", Context.MODE_PRIVATE);

            JSONObject settings =
                    new JSONObject(prefs.getString("settings", "{}"));

            java.util.Iterator<String> keys = updates.keys();

            while (keys.hasNext()) {
                String key = keys.next();
                settings.put(key, updates.get(key));
            }

            settings.put("startWithWindows", false);

            prefs.edit()
                    .putString("settings", settings.toString())
                    .apply();

            AndroidAgentService.settingsChanged(context);

            return settings.toString();
        } catch (Exception error) {
            return getSettingsJson();
        }
    }

    @JavascriptInterface
    public void startAgent() {
        AndroidAgentService.start(context);
    }

    @JavascriptInterface
    public void hideWindow() {
        activity.runOnUiThread(() -> activity.moveTaskToBack(true));
    }

    @JavascriptInterface
    public void showWindow() {
        activity.runOnUiThread(() -> {
            activity.moveTaskToBack(false);
            activity.getWindow().getDecorView().requestFocus();
        });
    }

    @JavascriptInterface
    public void exit() {
        AndroidAgentService.stop(context);
        activity.runOnUiThread(activity::finishAndRemoveTask);
    }

    @JavascriptInterface
    public void openSection(String section) {
        activity.openSection(section);
    }

    @JavascriptInterface
    public void authGoogle() {
        activity.runOnUiThread(() -> {
            try {
                GoogleSignInOptions options =
                        new GoogleSignInOptions.Builder(
                                GoogleSignInOptions.DEFAULT_SIGN_IN
                        )
                        .requestIdToken(
                                context.getString(
                                        com.thecontroller.android.R.string.default_web_client_id
                                )
                        )
                        .requestEmail()
                        .build();

                GoogleSignInClient client =
                        GoogleSignIn.getClient(activity, options);

                client.signOut().addOnCompleteListener(task -> {
                    Intent signInIntent = client.getSignInIntent();
                    activity.startActivityForResult(
                            signInIntent,
                            GOOGLE_SIGN_IN_REQUEST
                    );
                });

            } catch (Exception error) {
                activity.sendGoogleAuthResult(
                        null,
                        null,
                        error.getMessage()
                );
            }
        });
    }

    static void handleGoogleSignInResult(
            MainActivity activity,
            Intent data
    ) {
        Task<GoogleSignInAccount> task =
                GoogleSignIn.getSignedInAccountFromIntent(data);

        try {
            GoogleSignInAccount account =
                    task.getResult(ApiException.class);

            if (account == null) {
                activity.sendGoogleAuthResult(
                        null,
                        null,
                        "Google did not return an account."
                );
                return;
            }

            String idToken = account.getIdToken();

            if (idToken == null || idToken.isEmpty()) {
                activity.sendGoogleAuthResult(
                        null,
                        null,
                        "Google did not return an ID token."
                );
                return;
            }

            activity.sendGoogleAuthResult(
                    idToken,
                    null,
                    null
            );

        } catch (ApiException error) {
            activity.sendGoogleAuthResult(
                    null,
                    null,
                    "Google Sign-In failed: " + error.getStatusCode()
            );
        } catch (Exception error) {
            activity.sendGoogleAuthResult(
                    null,
                    null,
                    error.getMessage()
            );
        }
    }
}