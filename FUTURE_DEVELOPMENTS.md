# FUTURE_DEVELOPMENTS.md

This document outlines the proposed roadmap and future development suggestions to scale the TVS Electronics Attendance Tracker platform, enhance security, improve offline reliability, and add business intelligence features.

---

## 1. Security & Anti-Spoofing Features

### A. Biometric Verification (Mobile App)
* **Goal**: Prevent "buddy punching" (where an employee punches in on behalf of another by sharing credentials).
* **Implementation**:
  * Integrate `expo-local-authentication` in the Mobile Client.
  * Require a Face ID or fingerprint check-in verification prompt before generating attendance punches.
* **Component Touched**: `mobile/App.tsx` (within the check-in submission handler).

### B. Mock GPS / Location Spoofing Detection
* **Goal**: Detect if employees are using virtual location apps to fake their GPS coordinates.
* **Implementation**:
  * Read location coordinates from `expo-location` and inspect mock status properties. On Android, check `coords.mocked` or verify device developer settings.
  * Refuse checks if mock location flags are positive.

### C. Wi-Fi SSID Verification
* **Goal**: Add a secondary validation layer for on-site punches.
* **Implementation**:
  * Fetch the active network SSID. The punch is only logged as "Office/On-site" if the device is connected to the authorized TVSE office Wi-Fi networks, even if GPS coordinates drift indoors.

---

## 2. Reliability & Offline Support

### A. Offline Punch Queue
* **Goal**: Allow field workers to punch in when network connectivity is weak or offline.
* **Implementation**:
  * Implement local data storage (using `@react-native-async-storage/async-storage` or SQLite).
  * If the network is down, store the coordinates and timestamp securely locally.
  * Set up a background listener to automatically sync queued punches to Firestore once network connectivity is restored.
* **Component Touched**: `mobile/App.tsx` database writes.

---

## 3. Communication & Reminders

### B. Push Notifications on Request Approvals
* **Goal**: Alert employees instantly when their manager approves or rejects a request.
* **Implementation**:
  * Deploy Firebase Cloud Functions.
  * Listen to status changes on `/leaveRequests`, `/wfhRequests`, or `/regularizationRequests` collections.
  * Retrieve the target user's Expo push token and trigger a push notification via the Expo Push API.

---

## 4. Analytics & UI Improvements

### A. Visual GPS Punch Maps for Admins
* **Goal**: Provide administrators with visual insights into where off-site (WFH/On Duty) employees are punching from.
* **Implementation**:
  * Add a Map View to the Admin portal (`admin.dashboard.tsx` or `admin.attendance.tsx`) using Leaflet.
  * Plot markers for daily punches to visualize field work coverage.

### B. Shift Scheduling & Roster Management
* **Goal**: Support custom shifts (e.g. night shifts, rotation shifts) rather than assuming a single standard day.
* **Implementation**:
  * Create a new `/shifts` collection.
  * Let Admins assign shift schedules (Start/End times, weekends definition) to employees.
  * Update expected working days calculations in dashboards and calendar heatmaps.
