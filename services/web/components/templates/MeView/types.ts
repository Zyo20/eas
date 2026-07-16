export type MyProfile = {
  id: string;
  identifier: string;
  fullName: string;
  email: string;
  organization: { name: string; id: string; slug: string };
};

export type MyEvent = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
};

export type MyAttendanceRecord = {
  recordId: string;
  event: { id: string; name: string; startsAt: string; endsAt: string };
  scannedAt: string;
  source: 'SCAN' | 'MANUAL' | 'IMPORT';
  outsideGeofence: boolean;
  distanceM: number | null;
  geofenceSkipped: boolean;
};

export type QrPayload = {
  token: string;
  url: string;
  format: 'svg' | 'png';
  image: string; // base64
  imageMime: string;
};

export interface MeViewProps {}
