/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: 'operator' | 'admin' | 'viewer';
  signedInAt: number;
  token: string;
}