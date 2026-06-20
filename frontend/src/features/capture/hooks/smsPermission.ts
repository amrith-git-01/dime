import { checkIfHasSMSPermission } from "@maniac-tech/react-native-expo-read-sms";
import { Linking, PermissionsAndroid, Platform } from "react-native";

const SMS_RATIONALE = {
  title: "Allow SMS access",
  message:
    "Dime reads bank debit and credit SMS on this device to track expenses automatically. OTPs and promos are filtered out and not saved.",
  buttonPositive: "Allow",
  buttonNegative: "Not now",
} as const;

export type SmsPermissionStatus = {
  granted: boolean;
  read: boolean;
  receive: boolean;
};

export async function getSmsPermissionStatus(): Promise<SmsPermissionStatus> {
  if (Platform.OS !== "android") {
    return { granted: false, read: false, receive: false };
  }
  const status = await checkIfHasSMSPermission();
  const read = status.hasReadSmsPermission;
  const receive = status.hasReceiveSmsPermission;
  return {
    granted: read && receive,
    read,
    receive,
  };
}

export async function hasSmsPermissions(): Promise<boolean> {
  const status = await getSmsPermissionStatus();
  return status.granted;
}

async function requestOne(
  permission: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS],
): Promise<boolean> {
  const result = await PermissionsAndroid.request(permission, SMS_RATIONALE);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  const current = await getSmsPermissionStatus();
  if (current.granted) {
    return true;
  }

  if (!current.receive) {
    const receiveGranted = await requestOne(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    );
    if (!receiveGranted) {
      return false;
    }
  }

  if (!current.read) {
    const readGranted = await requestOne(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    );
    if (!readGranted) {
      return false;
    }
  }

  return hasSmsPermissions();
}

export function openAppSettings(): void {
  void Linking.openSettings();
}
