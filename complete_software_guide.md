# Complete Software Guide & User Manual: TVS Attendance Tracker

This guide provides a comprehensive functional and technical overview of the TVS Electronics Attendance Tracker system, detailing the distinct software versions (Web UI vs. Mobile APK) and the specific operations performed by each user role (Employee, Admin, and Super Admin).

---

## Part 1: Product Architectures (Web Portal vs. Mobile APK)

The system consists of two separate front-end applications connected to a single serverless Firebase backend:

### 1. Web Portal (Vite + React)
* **Target Audience**: Super Admins, Project Managers (Admins), and Corporate Employees checking logs.
* **Core Functions**: High-level visual dashboards, analytical trends, Excel report exports, employee profile management, project/office boundary configurations, and request approvals.
* **Hosting**: Deployed on **Vercel** for fast static file delivery and seamless HTML5 history API navigation routing.

### 2. Mobile Client / APK (Expo + React Native)
* **Target Audience**: Field-based and on-site Employees.
* **Core Functions**: GPS-based location tracking, map visualization (Leaflet), and instant geofenced check-in/out.
* **Build Delivery**: Packaged into an **Android APK** (and iOS container) compiled via Expo Application Services (EAS Build) for direct distribution and device-level GPS API access.

---

## Part 2: User Roles & Feature matrix

Below is a detailed breakdown of what actions each user role can perform across the different software versions.

### 1. Standard Employee Role

Employees use the system primarily to log their daily attendance and manage their leaves/requests.

#### Actions on the Mobile Client (APK)
* **Geofenced Check-In (Punch In)**:
  * Open the app to view their current location on a map.
  * The app automatically calculates their distance to their assigned project office location.
  * **On-Site Punch**: If they are within the allowed geofence boundary, they click "Punch In" to log their arrival (Status: `Present`).
  * **Off-Site WFH Punch**: If working remotely, they select `WFH` and must enter a valid **WFH Reason** to submit.
  * **On-Duty Punch**: If traveling or on field assignment, they select `On Duty` and must specify their target location/reason.
* **Check-Out (Punch Out)**:
  * Click "Punch Out" at the end of the shift to record their departure time. The app logs their exit coordinates to calculate total daily work hours.
* **Submit Requests**:
  * **Leave Requests**: Submit start/end dates and leave reasons for manager approval.
  * **WFH Requests**: Request upcoming remote days.
  * **Regularization Requests**: Request manager to correct past attendance discrepancies (e.g. forgot to punch in/out).
* **View Personal Attendance History**:
  * View a color-coded monthly calendar. Green indicates present, blue is WFH, yellow is on-duty, and red is a leave day.
  * Track remaining leave balance.

#### Actions on the Web Portal
* **Secure Login**: Access their account via email and password authentication.
* **Change Password**: Modify their profile password securely via the settings panel.

---

### 2. Project Manager (Admin) Role

Admins manage the employees and attendance records scoped to their assigned project codes.

#### Actions on the Web Portal
* **Daily Overview Dashboard**:
  * View active stats for the day: total team size, punched-in count, and absent list.
  * Access a dedicated modal list of employees who haven't checked in today.
  * **Reconcile Leaves**: Automatically audits employee leave requests against their profile balance counters.
  * **Excel Downloads**: Export daily attendance sheets categorized by project.
* **Monthly Analytics Dashboard**:
  * Set Month, Year, and Project filters.
  * View visual charts showing daily team attendance trends and activity distribution (Pie chart).
  * Review the **Employee Summary Table**: tracks each employee's monthly attendance rate (%), total days present, WFH days, on-duty days, leaves taken, absents, average working hours, and average check-in time.
  * Export the **Monthly Payroll Report**: A multi-sheet spreadsheet including high-level summaries and individual employee log sheets.
* **Employee Management**:
  * Create new employee profiles.
  * Assign employees to single or multiple projects and specify their coordinate boundaries.
  * Preview auto-generated IDs on creation.
* **Attendance Log Editor**:
  * View, insert, edit, or delete raw daily punch entries.
* **Request Approvals**:
  * Review pending requests (Leaves, WFH, and Regularizations).
  * Approving a request automatically inserts or updates the corresponding record in the daily attendance database.

---

### 3. Super Admin Role

Super Admins hold global control over the system configurations, global settings, and project structures.

#### Actions on the Web Portal
* **All Admin Actions**: Inherits full permission to manage all projects, view all dashboards, and edit employee lists across all locations.
* **Project Master Setup**:
  * Create, edit, or delete project codes.
* **Office Locations Configuration**:
  * Set up corporate office centers.
  * Use the map-based location picker to configure precise latitude/longitude parameters for geofencing boundaries.
* **System-Wide ID Re-sequencing**:
  * Correct database number gaps, duplicates, or random IDs.
  * Automatically updates employee documents and cascades sequence updates to `attendance`, `leaveRequests`, `wfhRequests`, and `regularizationRequests` collections to keep records unified.
  * Resets the database auto-generation counter to the correct next number (`total_employees + 1`).
