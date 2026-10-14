import {
  getApp,
  getApps,
  initializeApp,
} from 'firebase/app';

import {
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type Auth,
} from 'firebase/auth';

import {
  getFunctions,
  httpsCallable,
} from 'firebase/functions';

import {
  getMessaging,
  getToken,
  isSupported,
} from 'firebase/messaging';

import {
  auth,
  isOrganizerUid,
} from '../firebase';

const VAPID_PUBLIC_KEY =
  'BFAPC0QBB4A4_WQs_O0X2vsmISOPcC_kDcVXYw9GGqiEgthXORxWZrN98Hj0E9rWqEpTDZ_s7s6BdzndDS9iN1A';

const PUSH_API =
  'https://guanguan-push.guanguan-ph.workers.dev';

const MEMBER_PUSH_APP_NAME =
  'guanguan-member-push-auth';

type SendPushResponse = {
  ok: boolean;
  targetTokens: number;
  sent: number;
  failed: number;
};

type MemberLoginResponse = {
  customToken: string;
};

const getPushServiceWorker =
  async (): Promise<ServiceWorkerRegistration> => {
    if (!('serviceWorker' in navigator)) {
      throw new Error(
        'Service Worker ไม่รองรับบน Browser นี้'
      );
    }

    return navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      {
        scope:
          '/firebase-cloud-messaging-push-scope/',
      }
    );
  };

const waitForAuthReady =
  async (targetAuth: Auth): Promise<void> => {
    await new Promise<void>((resolve) => {
      let unsubscribe = () => undefined;

      unsubscribe =
        onAuthStateChanged(
          targetAuth,
          () => {
            unsubscribe();
            resolve();
          },
          () => {
            unsubscribe();
            resolve();
          }
        );
    });
  };

const getSecondaryMemberAuth = (): Auth => {
  const existing =
    getApps().find(
      (app) =>
        app.name === MEMBER_PUSH_APP_NAME
    );

  const secondaryApp =
    existing ??
    initializeApp(
      getApp().options,
      MEMBER_PUSH_APP_NAME
    );

  return getAuth(secondaryApp);
};

const validateMemberClaims = (
  claims: Record<string, unknown>,
  memberId: string
): boolean => {
  return (
    claims.role === 'member' &&
    claims.memberId === memberId &&
    Number.isSafeInteger(
      Number(claims.credentialVersion)
    ) &&
    Number(claims.credentialVersion) >= 1
  );
};

const getStoredSecondaryMemberIdToken =
  async (
    memberId: string
  ): Promise<string | null> => {
    const secondaryAuth =
      getSecondaryMemberAuth();

    await waitForAuthReady(
      secondaryAuth
    );

    const user =
      secondaryAuth.currentUser;

    if (!user) {
      return null;
    }

    const tokenResult =
      await user.getIdTokenResult(true);

    if (
      !validateMemberClaims(
        tokenResult.claims,
        memberId
      )
    ) {
      await signOut(secondaryAuth);
      return null;
    }

    return user.getIdToken(true);
  };

const authenticateOrganizerMemberForPush =
  async (
    memberId: string
  ): Promise<string> => {
    const storedToken =
      await getStoredSecondaryMemberIdToken(
        memberId
      );

    if (storedToken) {
      return storedToken;
    }

    const pinInput =
      window.prompt(
        'ยืนยัน PIN สมาชิก 6 หลัก เพื่อรับแจ้งเตือนคิวบนเครื่องผู้จัด'
      );

    if (pinInput === null) {
      throw new Error(
        'ยกเลิกการยืนยันสมาชิกสำหรับ Push'
      );
    }

    const pin =
      pinInput.trim();

    if (!/^\d{6}$/.test(pin)) {
      throw new Error(
        'PIN สมาชิกต้องเป็นตัวเลข 6 หลัก'
      );
    }

    const login =
      httpsCallable<
        {
          memberId: string;
          pin: string;
        },
        MemberLoginResponse
      >(
        getFunctions(getApp()),
        'memberIdentityLogin'
      );

    const result =
      await login({
        memberId,
        pin,
      });

    const customToken =
      result.data?.customToken;

    if (
      typeof customToken !== 'string' ||
      customToken.length === 0
    ) {
      throw new Error(
        'Member login did not return a valid token.'
      );
    }

    const secondaryAuth =
      getSecondaryMemberAuth();

    const credential =
      await signInWithCustomToken(
        secondaryAuth,
        customToken
      );

    const tokenResult =
      await credential.user.getIdTokenResult(
        true
      );

    if (
      !validateMemberClaims(
        tokenResult.claims,
        memberId
      )
    ) {
      await signOut(secondaryAuth);

      throw new Error(
        'Member authentication claims are invalid.'
      );
    }

    return credential.user.getIdToken(true);
  };

const resolveRegisterIdToken =
  async (
    memberId: string
  ): Promise<string> => {
    const primaryUser =
      auth.currentUser;

    if (!primaryUser) {
      throw new Error(
        'Firebase session ยังไม่พร้อม'
      );
    }

    const primaryTokenResult =
      await primaryUser.getIdTokenResult(
        true
      );

    if (
      validateMemberClaims(
        primaryTokenResult.claims,
        memberId
      )
    ) {
      return primaryUser.getIdToken(true);
    }

    if (
      isOrganizerUid(
        primaryUser.uid
      )
    ) {
      return authenticateOrganizerMemberForPush(
        memberId
      );
    }

    throw new Error(
      'บัญชีปัจจุบันไม่ใช่สมาชิกหรือผู้จัดที่ได้รับอนุญาต'
    );
  };

const postPushApi = async <T>(
  path: string,
  body: unknown,
  idTokenOverride?: string
): Promise<T> => {
  let idToken =
    idTokenOverride;

  if (!idToken) {
    const user =
      auth.currentUser;

    if (!user) {
      throw new Error(
        'Firebase session ยังไม่พร้อม'
      );
    }

    idToken =
      await user.getIdToken();
  }

  const response =
    await fetch(
      `${PUSH_API}${path}`,
      {
        method: 'POST',
        headers: {
          authorization:
            `Bearer ${idToken}`,
          'content-type':
            'application/json',
        },
        body: JSON.stringify(body),
      }
    );

  const payload =
    await response.json().catch(
      () => null
    );

  if (!response.ok) {
    const errorCode =
      payload &&
      typeof payload.error === 'string'
        ? payload.error
        : `HTTP_${response.status}`;

    throw new Error(
      `Push API: ${errorCode}`
    );
  }

  return payload as T;
};

export async function registerMemberPushV1(
  memberId: string
): Promise<void> {
  const supported =
    await isSupported();

  if (!supported) {
    throw new Error(
      'FCM Web Push ไม่รองรับบน Browser นี้'
    );
  }

  if (
    Notification.permission !== 'granted'
  ) {
    throw new Error(
      'ยังไม่ได้อนุญาต Notification'
    );
  }

  const idToken =
    await resolveRegisterIdToken(
      memberId
    );

  const registration =
    await getPushServiceWorker();

  const token =
    await getToken(
      getMessaging(getApp()),
      {
        vapidKey:
          VAPID_PUBLIC_KEY,
        serviceWorkerRegistration:
          registration,
      }
    );

  if (!token) {
    throw new Error(
      'Firebase ไม่สามารถสร้าง Push Token ได้'
    );
  }

  await postPushApi<{ ok: boolean }>(
    '/v1/register',
    {
      token,
      memberId,
    },
    idToken
  );
}

export async function sendMemberQueuePushV1(
  input: {
    memberIds: string[];
    kind: 'pm' | 'court';
    title: string;
    body: string;
    tag: string;
    url?: string;
  }
): Promise<SendPushResponse> {
  return postPushApi<SendPushResponse>(
    '/v1/send',
    input
  );
}
