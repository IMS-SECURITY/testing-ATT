import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { auth, db } from './firebase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const SEED_ADMIN_EMAIL = 'mohanrammurugesan1@gmail.com';

// ─── Utility Functions ────────────────────────────────────────────────────────
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTimeStr(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay(); // 0=Sun
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ─── TVSE Logo ────────────────────────────────────────────────────────────────
function TVSELogo({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  const isLarge = size === 'large';
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={[styles.tvseLogoText, isLarge && { fontSize: 36, letterSpacing: -1.5 }]}>
        TVSE
      </Text>
      <Text style={[styles.tvseLogoSubText, isLarge && { fontSize: 10, letterSpacing: 2 }]}>
        TVS ELECTRONICS
      </Text>
    </View>
  );
}

// ─── Calendar Grid Component ──────────────────────────────────────────────────
function CalendarGrid({
  year, month, holidays, attendanceDates
}: {
  year: number;
  month: number;
  holidays: any[];
  attendanceDates?: string[];
}) {
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const today = new Date();
  const todayStr = formatDateStr(today);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const holidayMap: Record<string, any> = {};
  holidays.forEach((h) => {
    holidayMap[h.date] = h;
  });

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  while (rows[rows.length - 1]?.length < 7) {
    rows[rows.length - 1].push(null);
  }

  return (
    <View style={calStyles.grid}>
      {/* Day headers */}
      <View style={calStyles.headerRow}>
        {DAY_NAMES.map((d) => (
          <Text key={d} style={calStyles.dayHeader}>{d}</Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={calStyles.row}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={calStyles.emptyCell} />;
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const holiday = holidayMap[dateStr];
            const isToday = dateStr === todayStr;
            const isWeekend = ci === 0 || ci === 6;
            const hasAttendance = attendanceDates?.includes(dateStr);
            return (
              <View
                key={ci}
                style={[
                  calStyles.cell,
                  isToday && calStyles.todayCell,
                  holiday && calStyles.holidayCell,
                  hasAttendance && !holiday && calStyles.attendanceCell,
                ]}
              >
                <Text style={[
                  calStyles.cellText,
                  isToday && calStyles.todayCellText,
                  holiday && calStyles.holidayCellText,
                  isWeekend && !holiday && !isToday && calStyles.weekendText,
                ]}>
                  {day}
                </Text>
                {holiday && (
                  <Text style={calStyles.holidayLabel} numberOfLines={1}>
                    {holiday.name}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);

  // Fade animation for splash
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [activeTab, setActiveTab] = useState<string>('punch');

  // Punch state
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [punching, setPunching] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('Tap to check location');
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [myHistory, setMyHistory] = useState<any[]>([]);

  // Calendar state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  // Add holiday (super admin)
  const [showAddHoliday, setShowAddHoliday] = useState(false);
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const [hType, setHType] = useState<'national' | 'optional' | 'restricted'>('national');
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Leave/WFH
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveType, setLeaveType] = useState<'leave' | 'wfh'>('leave');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);

  // Admin: Attendance
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [loadingAllAttendance, setLoadingAllAttendance] = useState(false);
  const [attendanceFilter, setAttendanceFilter] = useState('');

  // Admin: Employees
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [empIDInput, setEmpIDInput] = useState('');
  const [empNameInput, setEmpNameInput] = useState('');
  const [empEmailInput, setEmpEmailInput] = useState('');
  const [empRoleInput, setEmpRoleInput] = useState<'employee' | 'admin'>('employee');
  const [savingEmp, setSavingEmp] = useState(false);

  // Admin: Requests
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Super Admin
  const [projects, setProjects] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [newProjId, setNewProjId] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [loadingSuper, setLoadingSuper] = useState(false);
  const [selectedProjForOffice, setSelectedProjForOffice] = useState<any>(null);
  const [officeNameInput, setOfficeNameInput] = useState('');
  const [officeLatInput, setOfficeLatInput] = useState('');
  const [officeLngInput, setOfficeLngInput] = useState('');
  const [officeRadiusInput, setOfficeRadiusInput] = useState('0.25');
  const [savingOffice, setSavingOffice] = useState(false);

  const allowedRadiusKm = userProfile?.radiusKm ?? 0.25;

  // ── Notification setup ───────────────────────────────────────────────────
  const scheduleShiftReminder = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      let finalStatus = status;
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        finalStatus = newStatus;
      }
      if (finalStatus !== 'granted') return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ TVSE Attendance Reminder',
          body: "Don't forget to punch in for your shift today!",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 9,
          minute: 0,
        },
      });
    } catch (e) {
      console.log('Notification scheduling skipped');
    }
  };

  // ── Splash fade in ───────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Check persisted auth
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        await fetchUserProfile(u);
      }
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      setUser(res.user);
      await fetchUserProfile(res.user);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'An error occurred');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut(auth);
          setUser(null);
          setUserProfile(null);
          setTodayRecord(null);
          setEmail('');
          setPassword('');
          setActiveTab('punch');
        },
      },
    ]);
  };

  const fetchUserProfile = async (u: any) => {
    try {
      const ref = doc(db, 'employees', u.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        if (u.email?.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase()) {
          const seed = {
            employeeID: 'SUPER-001',
            name: 'Super Administrator',
            email: u.email,
            officeLat: 0,
            officeLng: 0,
            role: 'superadmin',
            projectId: null,
          };
          await setDoc(ref, { ...seed, createdAt: serverTimestamp() });
          setUserProfile(seed);
          setActiveTab('superadmin');
          return;
        }
        setUserProfile(null);
        return;
      }
      const data = snap.data();
      if (u.email?.toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase() && data.role !== 'superadmin') {
        await setDoc(ref, { ...data, role: 'superadmin' }, { merge: true });
        data.role = 'superadmin';
      }
      setUserProfile(data);
      if (data.role === 'superadmin') {
        setActiveTab('superadmin');
      } else if (data.role === 'admin') {
        setActiveTab('admin_attendance');
      } else {
        setActiveTab('punch');
      }
    } catch (err) {
      console.log('Error fetching user profile:', err);
    }
  };

  // ── Data Fetchers ─────────────────────────────────────────────────────────
  const fetchTodayRecord = async () => {
    if (!user) return;
    setLoadingRecord(true);
    try {
      const todayStr = formatDateStr(new Date());
      const q = query(
        collection(db, 'attendance'),
        where('uid', '==', user.uid),
        where('date', '==', todayStr)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const activeDoc = snap.docs.find((d) => d.data().status === 'present');
        setTodayRecord(activeDoc ? { id: activeDoc.id, ...activeDoc.data() } : null);
      } else {
        setTodayRecord(null);
      }
    } catch (err) {
      console.log('Error fetching today record:', err);
    } finally {
      setLoadingRecord(false);
    }
  };

  const fetchMyHistory = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'attendance'),
        where('uid', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setMyHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.log('Error fetching history:', err);
    }
  };

  const fetchHolidays = async (year?: number) => {
    setLoadingHolidays(true);
    try {
      const y = year ?? calYear;
      const snap = await getDocs(collection(db, 'holidays'));
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      // Filter by year or show all
      setHolidays(all);
    } catch (err) {
      console.log('Error fetching holidays:', err);
    } finally {
      setLoadingHolidays(false);
    }
  };

  const fetchMyLeaves = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'leaveRequests'), where('uid', '==', user.uid));
      const snap = await getDocs(q);
      setMyLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.log('Error fetching my leaves:', err);
    }
  };

  const fetchAdminAttendance = async () => {
    setLoadingAllAttendance(true);
    try {
      const snap = await getDocs(collection(db, 'attendance'));
      setAllAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.log('Error fetching admin attendance:', err);
    } finally {
      setLoadingAllAttendance(false);
    }
  };

  const fetchEmployeesList = async () => {
    setLoadingEmployees(true);
    try {
      const snap = await getDocs(collection(db, 'employees'));
      setAllEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.log('Error fetching employees:', err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const fetchPendingRequests = async () => {
    setLoadingRequests(true);
    try {
      const snap = await getDocs(collection(db, 'leaveRequests'));
      setPendingRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.log('Error fetching requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchSuperData = async () => {
    setLoadingSuper(true);
    try {
      const [pSnap, oSnap] = await Promise.all([
        getDocs(collection(db, 'projects')),
        getDocs(collection(db, 'offices')),
      ]);
      const projs = pSnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name || d.id, ...d.data() }));
      const offs = oSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProjects(projs);
      setOffices(offs);
    } catch (err) {
      console.log('Error fetching super data:', err);
    } finally {
      setLoadingSuper(false);
    }
  };

  // ── Location & Punch ──────────────────────────────────────────────────────
  const verifyLocation = async () => {
    setLocationStatus('Requesting GPS permissions...');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationStatus('Location permission denied.');
      return null;
    }
    setLocationStatus('Acquiring GPS position...');
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCurrentCoords(coords);
      if (userProfile?.officeLat && userProfile?.officeLng && userProfile.officeLat !== 0) {
        const dist = distanceKm(coords.lat, coords.lng, userProfile.officeLat, userProfile.officeLng);
        if (dist > allowedRadiusKm) {
          setLocationStatus(`Outside zone (${(dist * 1000).toFixed(0)}m away)`);
        } else {
          setLocationStatus('✅ Inside workplace zone');
        }
      } else {
        setLocationStatus('✅ GPS position acquired');
      }
      return coords;
    } catch (e) {
      setLocationStatus('Failed to get GPS position');
      return null;
    }
  };

  const handlePunchIn = async () => {
    setPunching(true);
    try {
      const coords = await verifyLocation();
      if (!coords) { setPunching(false); return; }
      if (userProfile?.officeLat && userProfile?.officeLng && userProfile.officeLat !== 0) {
        const dist = distanceKm(coords.lat, coords.lng, userProfile.officeLat, userProfile.officeLng);
        if (dist > allowedRadiusKm) {
          Alert.alert('Geofence Violation', `You are ${(dist * 1000).toFixed(0)}m away from your assigned office.`);
          setPunching(false);
          return;
        }
      }
      const now = new Date();
      const newRecord = {
        uid: user.uid,
        employeeID: userProfile?.employeeID || 'EMP-MOBILE',
        name: userProfile?.name || user.email,
        email: user.email,
        projectId: userProfile?.projectId || null,
        projectName: userProfile?.projectName || null,
        date: formatDateStr(now),
        time: formatTimeStr(now),
        lat: coords.lat,
        lng: coords.lng,
        status: 'present',
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'attendance'), newRecord);
      setTodayRecord({ id: docRef.id, ...newRecord });
      Alert.alert('✅ Punched In', `Punch In recorded at ${newRecord.time}`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to punch in');
    } finally {
      setPunching(false);
    }
  };

  const handlePunchOut = async () => {
    if (!todayRecord) return;
    Alert.alert('Confirm Punch Out', 'Are you sure you want to punch out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch Out',
        style: 'destructive',
        onPress: async () => {
          setPunching(true);
          try {
            const coords = await verifyLocation();
            if (!coords) { setPunching(false); return; }
            const now = new Date();
            await updateDoc(doc(db, 'attendance', todayRecord.id), {
              punchOutTime: formatTimeStr(now),
              punchOutLat: coords.lat,
              punchOutLng: coords.lng,
              status: 'completed',
              updatedAt: serverTimestamp(),
            });
            setTodayRecord(null);
            fetchMyHistory();
            Alert.alert('✅ Punched Out', `Punch Out recorded at ${formatTimeStr(now)}`);
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to punch out');
          } finally {
            setPunching(false);
          }
        },
      },
    ]);
  };

  // ── Leave Actions ─────────────────────────────────────────────────────────
  const handleSubmitLeave = async () => {
    if (!leaveStartDate || !leaveReason) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }
    if (leaveType === 'leave' && !leaveEndDate) {
      Alert.alert('Error', 'Please enter an end date for leave');
      return;
    }
    setSubmittingRequest(true);
    try {
      await addDoc(collection(db, 'leaveRequests'), {
        uid: user.uid,
        employeeID: userProfile?.employeeID || 'EMP-MOBILE',
        name: userProfile?.name || user.email,
        email: user.email,
        projectId: userProfile?.projectId || null,
        projectName: userProfile?.projectName || null,
        startDate: leaveStartDate,
        endDate: leaveType === 'leave' ? leaveEndDate : leaveStartDate,
        reason: leaveReason,
        type: leaveType,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      Alert.alert('Submitted', `${leaveType === 'wfh' ? 'WFH' : 'Leave'} request submitted successfully`);
      setLeaveStartDate(''); setLeaveEndDate(''); setLeaveReason('');
      fetchMyLeaves();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSubmittingRequest(false);
    }
  };

  // ── Admin Actions ─────────────────────────────────────────────────────────
  const handleApproveRequest = async (id: string) => {
    try {
      await updateDoc(doc(db, 'leaveRequests', id), { status: 'approved' });
      Alert.alert('Approved', 'Request has been approved');
      fetchPendingRequests();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRejectRequest = async (id: string) => {
    Alert.alert('Reject Request', 'Are you sure you want to reject this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'leaveRequests', id), { status: 'rejected' });
            Alert.alert('Rejected', 'Request has been rejected');
            fetchPendingRequests();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── Super Admin Actions ───────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!newProjId || !newProjName) {
      Alert.alert('Error', 'Enter both Project ID and Name');
      return;
    }
    try {
      const pid = newProjId.trim().toUpperCase();
      await setDoc(doc(db, 'projects', pid), { name: newProjName.trim(), createdAt: serverTimestamp() });
      Alert.alert('Created', `Project "${newProjName}" created`);
      setNewProjId(''); setNewProjName('');
      fetchSuperData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleAddOffice = async () => {
    if (!selectedProjForOffice || !officeNameInput || !officeLatInput || !officeLngInput) {
      Alert.alert('Error', 'Fill all office fields');
      return;
    }
    const lat = parseFloat(officeLatInput);
    const lng = parseFloat(officeLngInput);
    const radius = parseFloat(officeRadiusInput) || 0.25;
    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert('Error', 'Invalid latitude or longitude');
      return;
    }
    setSavingOffice(true);
    try {
      await addDoc(collection(db, 'offices'), {
        projectId: selectedProjForOffice.id,
        name: officeNameInput.trim(),
        lat,
        lng,
        radiusKm: radius,
        createdAt: serverTimestamp(),
      });
      Alert.alert('Added', `Office "${officeNameInput}" added`);
      setOfficeNameInput(''); setOfficeLatInput(''); setOfficeLngInput(''); setOfficeRadiusInput('0.25');
      setSelectedProjForOffice(null);
      fetchSuperData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingOffice(false);
    }
  };

  const handleDeleteOffice = async (officeId: string, name: string) => {
    Alert.alert('Delete Office', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'offices', officeId));
            fetchSuperData();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleDeleteProject = async (projId: string, projName: string) => {
    Alert.alert('Delete Project', `Remove project "${projName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'projects', projId));
            fetchSuperData();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleAddHoliday = async () => {
    if (!hDate || !hName) {
      Alert.alert('Error', 'Enter holiday date and name');
      return;
    }
    setSavingHoliday(true);
    try {
      await addDoc(collection(db, 'holidays'), {
        date: hDate,
        name: hName.trim(),
        type: hType,
        createdAt: serverTimestamp(),
      });
      Alert.alert('Added', `Holiday "${hName}" added`);
      setHDate(''); setHName(''); setHType('national');
      setShowAddHoliday(false);
      fetchHolidays();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string, name: string) => {
    Alert.alert('Delete Holiday', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'holidays', id));
            fetchHolidays();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── Employee Actions ──────────────────────────────────────────────────────
  const handleSaveEmployee = async () => {
    if (!empNameInput || !empEmailInput) {
      Alert.alert('Error', 'Name and Email are required');
      return;
    }
    setSavingEmp(true);
    try {
      if (editingEmp) {
        await updateDoc(doc(db, 'employees', editingEmp.id), {
          name: empNameInput.trim(),
          email: empEmailInput.trim(),
          role: empRoleInput,
          updatedAt: serverTimestamp(),
        });
        Alert.alert('Updated', 'Employee updated successfully');
      } else {
        const empDocId = `emp_${Date.now()}`;
        await setDoc(doc(db, 'employees', empDocId), {
          employeeID: empIDInput || `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
          name: empNameInput.trim(),
          email: empEmailInput.trim(),
          role: empRoleInput,
          officeLat: 0,
          officeLng: 0,
          createdAt: serverTimestamp(),
        });
        Alert.alert('Added', 'Employee added successfully');
      }
      setShowEmpForm(false);
      setEditingEmp(null);
      setEmpIDInput(''); setEmpNameInput(''); setEmpEmailInput('');
      setEmpRoleInput('employee');
      fetchEmployeesList();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSavingEmp(false);
    }
  };

  const handleDeleteEmployee = async (empId: string, name: string) => {
    Alert.alert('Delete Employee', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'employees', empId));
            fetchEmployeesList();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      fetchTodayRecord();
      fetchMyHistory();
      scheduleShiftReminder();
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'punch') {
      fetchTodayRecord();
      verifyLocation();
    }
    if (activeTab === 'calendar') fetchHolidays();
    if (activeTab === 'leave') fetchMyLeaves();
    if (activeTab === 'admin_attendance') fetchAdminAttendance();
    if (activeTab === 'admin_employees') fetchEmployeesList();
    if (activeTab === 'admin_requests') fetchPendingRequests();
    if (activeTab === 'superadmin') { fetchSuperData(); fetchHolidays(); }
  }, [activeTab]);

  const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'superadmin';
  const isSuper = userProfile?.role === 'superadmin';

  // ── Computed ──────────────────────────────────────────────────────────────
  const filteredAttendance = attendanceFilter
    ? allAttendance.filter(
        (a) =>
          (a.name || '').toLowerCase().includes(attendanceFilter.toLowerCase()) ||
          (a.date || '').includes(attendanceFilter)
      )
    : allAttendance;

  const holidaysInMonth = holidays.filter((h) => {
    const [y, m] = (h.date || '').split('-');
    return parseInt(y) === calYear && parseInt(m) === calMonth;
  });

  const myAttendanceDates = myHistory.map((a) => a.date);

  // ── Splash / Initializing ─────────────────────────────────────────────────
  if (initializing) {
    return (
      <SafeAreaView style={styles.splashContainer}>
        <LinearGradient colors={['#0f172a', '#0369a1', '#0284c7']} style={styles.splashGradient}>
          <TVSELogo size="large" />
          <ActivityIndicator color="#ffffff" size="large" style={{ marginTop: 40 }} />
          <Text style={styles.splashSubText}>Loading...</Text>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ── Status badge color ─────────────────────────────────────────────────────
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#16a34a';
      case 'rejected': return '#dc2626';
      case 'pending': return '#d97706';
      default: return '#0284c7';
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <LinearGradient colors={['#0f172a', '#0c1a2e']} style={styles.header}>
        <TVSELogo />
        {user && (
          <View style={styles.headerRight}>
            <View style={styles.headerUserInfo}>
              <Text style={styles.headerUserName} numberOfLines={1}>
                {userProfile?.name?.split(' ')[0] || 'User'}
              </Text>
              {isSuper && (
                <View style={styles.superBadge}>
                  <Text style={styles.superBadgeText}>SUPER</Text>
                </View>
              )}
              {isAdmin && !isSuper && (
                <View style={[styles.superBadge, { backgroundColor: '#7c3aed' }]}>
                  <Text style={styles.superBadgeText}>ADMIN</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

      {!user ? (
        // ────────── LOGIN SCREEN ──────────────────────────────────────────────
        <LinearGradient colors={['#0f172a', '#0369a1', '#0ea5e9']} style={styles.loginScreen}>
          <Animated.View style={[styles.loginContainer, { opacity: fadeAnim }]}>
            <View style={styles.loginLogoArea}>
              <TVSELogo size="large" />
              <Text style={styles.loginTagline}>Attendance Tracker</Text>
            </View>

            <View style={styles.loginCard}>
              <Text style={styles.loginCardTitle}>Sign In</Text>
              <Text style={styles.loginCardSub}>Enter your credentials to continue</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@tvse.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, authLoading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={authLoading}
              >
                <LinearGradient colors={['#0369a1', '#0284c7']} style={styles.primaryBtnGrad}>
                  {authLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Sign In</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </LinearGradient>
      ) : (
        // ────────── MAIN APP SCREEN ───────────────────────────────────────────
        <View style={styles.appContainer}>
          {/* Tab navigation */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBar}
            contentContainerStyle={styles.tabBarContent}
          >
            {/* Punch tab – shown to all roles */}
            <TouchableOpacity
              style={[styles.tab, activeTab === 'punch' && styles.tabActive]}
              onPress={() => setActiveTab('punch')}
            >
              <Text style={[styles.tabText, activeTab === 'punch' && styles.tabTextActive]}>
                📍 Punch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'calendar' && styles.tabActive]}
              onPress={() => setActiveTab('calendar')}
            >
              <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>
                📅 Calendar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'leave' && styles.tabActive]}
              onPress={() => setActiveTab('leave')}
            >
              <Text style={[styles.tabText, activeTab === 'leave' && styles.tabTextActive]}>
                📝 Leave/WFH
              </Text>
            </TouchableOpacity>

            {isAdmin && (
              <>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'admin_attendance' && styles.tabActive]}
                  onPress={() => setActiveTab('admin_attendance')}
                >
                  <Text style={[styles.tabText, activeTab === 'admin_attendance' && styles.tabTextActive]}>
                    📊 Attendance
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tab, activeTab === 'admin_employees' && styles.tabActive]}
                  onPress={() => setActiveTab('admin_employees')}
                >
                  <Text style={[styles.tabText, activeTab === 'admin_employees' && styles.tabTextActive]}>
                    👥 Employees
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tab, activeTab === 'admin_requests' && styles.tabActive]}
                  onPress={() => setActiveTab('admin_requests')}
                >
                  <Text style={[styles.tabText, activeTab === 'admin_requests' && styles.tabTextActive]}>
                    📋 Requests
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {isSuper && (
              <TouchableOpacity
                style={[styles.tab, activeTab === 'superadmin' && styles.tabActive]}
                onPress={() => setActiveTab('superadmin')}
              >
                <Text style={[styles.tabText, activeTab === 'superadmin' && styles.tabTextActive]}>
                  🛡 Super
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Tab Content */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>

            {/* ── PUNCH TAB ── */}
            {activeTab === 'punch' && (
              <View>
                <Text style={styles.pageTitle}>Attendance Punch</Text>
                <Text style={styles.pageSub}>
                  {formatDateStr(new Date())} · {userProfile?.name || user.email}
                </Text>

                {/* Location Card */}
                <View style={styles.locationCard}>
                  <Text style={styles.locationCardTitle}>📍 Location Status</Text>
                  <Text style={styles.locationCardStatus}>{locationStatus}</Text>
                  {currentCoords && (
                    <Text style={styles.coordsText}>
                      {currentCoords.lat.toFixed(6)}, {currentCoords.lng.toFixed(6)}
                    </Text>
                  )}
                  <TouchableOpacity onPress={verifyLocation} style={styles.refreshBtn}>
                    <Text style={styles.refreshBtnText}>🔄 Refresh GPS</Text>
                  </TouchableOpacity>
                </View>

                {/* Punch Card */}
                {loadingRecord ? (
                  <View style={styles.card}>
                    <ActivityIndicator color="#0284c7" size="large" />
                  </View>
                ) : todayRecord ? (
                  <View style={styles.card}>
                    <View style={styles.punchedInBadge}>
                      <Text style={styles.punchedInBadgeText}>✅ PUNCHED IN</Text>
                    </View>
                    <Text style={styles.punchTimeText}>In: {todayRecord.time}</Text>
                    {todayRecord.projectName && (
                      <Text style={styles.punchProjectText}>📁 {todayRecord.projectName}</Text>
                    )}
                    <TouchableOpacity
                      style={[styles.bigBtn, styles.btnRed, punching && styles.btnDisabled]}
                      onPress={handlePunchOut}
                      disabled={punching}
                    >
                      {punching ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.bigBtnText}>PUNCH OUT</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.card}>
                    <View style={styles.notPunchedBadge}>
                      <Text style={styles.notPunchedBadgeText}>⏸ NOT PUNCHED IN</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.bigBtn, styles.btnGreen, punching && styles.btnDisabled]}
                      onPress={handlePunchIn}
                      disabled={punching}
                    >
                      {punching ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.bigBtnText}>PUNCH IN</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* My recent history */}
                {myHistory.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Recent Attendance</Text>
                    {myHistory.slice(0, 7).map((rec) => (
                      <View key={rec.id} style={styles.historyRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyDate}>{rec.date}</Text>
                          <Text style={styles.historyTime}>
                            In: {rec.time || '-'}  {rec.punchOutTime ? `· Out: ${rec.punchOutTime}` : ''}
                          </Text>
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: rec.status === 'present' || rec.status === 'completed' ? '#dcfce7' : '#fee2e2' }]}>
                          <Text style={[styles.statusChipText, { color: rec.status === 'present' || rec.status === 'completed' ? '#16a34a' : '#dc2626' }]}>
                            {rec.status?.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ── CALENDAR TAB ── */}
            {activeTab === 'calendar' && (
              <View>
                <Text style={styles.pageTitle}>Holiday Calendar</Text>

                {/* Month Navigator */}
                <View style={styles.monthNav}>
                  <TouchableOpacity
                    style={styles.monthNavBtn}
                    onPress={() => {
                      if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
                      else setCalMonth(m => m - 1);
                    }}
                  >
                    <Text style={styles.monthNavBtnText}>‹</Text>
                  </TouchableOpacity>
                  <Text style={styles.monthLabel}>{MONTH_NAMES[calMonth - 1]} {calYear}</Text>
                  <TouchableOpacity
                    style={styles.monthNavBtn}
                    onPress={() => {
                      if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
                      else setCalMonth(m => m + 1);
                    }}
                  >
                    <Text style={styles.monthNavBtnText}>›</Text>
                  </TouchableOpacity>
                </View>

                {loadingHolidays ? (
                  <ActivityIndicator color="#0284c7" style={{ marginVertical: 20 }} />
                ) : (
                  <View style={styles.card}>
                    <CalendarGrid
                      year={calYear}
                      month={calMonth}
                      holidays={holidays}
                      attendanceDates={myAttendanceDates}
                    />
                  </View>
                )}

                {/* Legend */}
                <View style={styles.calLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#0284c7' }]} />
                    <Text style={styles.legendText}>Today</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#fef08a' }]} />
                    <Text style={styles.legendText}>Holiday</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#bbf7d0' }]} />
                    <Text style={styles.legendText}>Present</Text>
                  </View>
                </View>

                {/* Holidays list for month */}
                {holidaysInMonth.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>
                      Holidays in {MONTH_NAMES[calMonth - 1]}
                    </Text>
                    {holidaysInMonth.map((h) => (
                      <View key={h.id} style={styles.holidayRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.holidayName}>{h.name}</Text>
                          <Text style={styles.holidayDate}>{h.date}</Text>
                        </View>
                        <View style={[styles.holidayTypeBadge, {
                          backgroundColor: h.type === 'national' ? '#dbeafe' : h.type === 'optional' ? '#fef9c3' : '#ffe4e6'
                        }]}>
                          <Text style={[styles.holidayTypeBadgeText, {
                            color: h.type === 'national' ? '#1d4ed8' : h.type === 'optional' ? '#854d0e' : '#be123c'
                          }]}>
                            {h.type || 'national'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ── LEAVE/WFH TAB ── */}
            {activeTab === 'leave' && (
              <View>
                <Text style={styles.pageTitle}>Leave & WFH Requests</Text>

                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Apply for Leave / WFH</Text>

                  {/* Type selector */}
                  <View style={styles.typeRow}>
                    <TouchableOpacity
                      style={[styles.typeBtn, leaveType === 'leave' && styles.typeBtnActive]}
                      onPress={() => setLeaveType('leave')}
                    >
                      <Text style={[styles.typeBtnText, leaveType === 'leave' && styles.typeBtnTextActive]}>
                        📆 Leave
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.typeBtn, leaveType === 'wfh' && styles.typeBtnActive]}
                      onPress={() => setLeaveType('wfh')}
                    >
                      <Text style={[styles.typeBtnText, leaveType === 'wfh' && styles.typeBtnTextActive]}>
                        🏠 WFH
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>
                    {leaveType === 'wfh' ? 'Date (YYYY-MM-DD)' : 'Start Date (YYYY-MM-DD)'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2024-08-15"
                    placeholderTextColor="#94a3b8"
                    value={leaveStartDate}
                    onChangeText={setLeaveStartDate}
                  />

                  {leaveType === 'leave' && (
                    <>
                      <Text style={styles.inputLabel}>End Date (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="2024-08-16"
                        placeholderTextColor="#94a3b8"
                        value={leaveEndDate}
                        onChangeText={setLeaveEndDate}
                      />
                    </>
                  )}

                  <Text style={styles.inputLabel}>Reason</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Reason for leave..."
                    placeholderTextColor="#94a3b8"
                    value={leaveReason}
                    onChangeText={setLeaveReason}
                    multiline
                    numberOfLines={3}
                  />

                  <TouchableOpacity
                    style={[styles.primaryBtn, submittingRequest && styles.btnDisabled]}
                    onPress={handleSubmitLeave}
                    disabled={submittingRequest}
                  >
                    <LinearGradient colors={['#0369a1', '#0284c7']} style={styles.primaryBtnGrad}>
                      {submittingRequest ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>Submit Request</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* My requests */}
                {myLeaves.length > 0 && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>My Requests</Text>
                    {myLeaves.map((l) => (
                      <View key={l.id} style={styles.requestRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.requestName}>
                            {l.type === 'wfh' ? '🏠 WFH' : '📆 Leave'} · {l.startDate}
                            {l.endDate && l.endDate !== l.startDate ? ` → ${l.endDate}` : ''}
                          </Text>
                          <Text style={styles.requestReason} numberOfLines={2}>{l.reason}</Text>
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: `${getStatusColor(l.status)}20` }]}>
                          <Text style={[styles.statusChipText, { color: getStatusColor(l.status) }]}>
                            {l.status?.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ── ADMIN ATTENDANCE TAB ── */}
            {activeTab === 'admin_attendance' && (
              <View>
                <Text style={styles.pageTitle}>All Attendance Records</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 12 }]}
                  placeholder="Search by name or date..."
                  placeholderTextColor="#94a3b8"
                  value={attendanceFilter}
                  onChangeText={setAttendanceFilter}
                />
                <TouchableOpacity style={styles.outlineBtn} onPress={fetchAdminAttendance}>
                  <Text style={styles.outlineBtnText}>🔄 Refresh</Text>
                </TouchableOpacity>
                {loadingAllAttendance ? (
                  <ActivityIndicator color="#0284c7" style={{ marginVertical: 20 }} />
                ) : filteredAttendance.length === 0 ? (
                  <Text style={styles.emptyText}>No attendance records found</Text>
                ) : (
                  filteredAttendance.map((item) => (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardName}>{item.name || item.email}</Text>
                        <View style={[styles.statusChip, {
                          backgroundColor: item.status === 'present' || item.status === 'completed' ? '#dcfce7' : '#fee2e2'
                        }]}>
                          <Text style={[styles.statusChipText, {
                            color: item.status === 'present' || item.status === 'completed' ? '#16a34a' : '#dc2626'
                          }]}>
                            {item.status?.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.attDetail}>📅 {item.date}</Text>
                      <Text style={styles.attDetail}>
                        🕐 In: {item.time || '-'}  {item.punchOutTime ? `· Out: ${item.punchOutTime}` : ''}
                      </Text>
                      {item.projectName && (
                        <Text style={styles.attDetail}>📁 {item.projectName}</Text>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ── ADMIN EMPLOYEES TAB ── */}
            {activeTab === 'admin_employees' && (
              <View>
                <View style={styles.pageTitleRow}>
                  <Text style={styles.pageTitle}>Employee Directory</Text>
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => {
                      setEditingEmp(null);
                      setEmpIDInput(''); setEmpNameInput(''); setEmpEmailInput('');
                      setEmpRoleInput('employee');
                      setShowEmpForm(true);
                    }}
                  >
                    <Text style={styles.addBtnText}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {showEmpForm && (
                  <View style={styles.formCard}>
                    <Text style={styles.formCardTitle}>{editingEmp ? '✏️ Edit Employee' : '➕ New Employee'}</Text>

                    <Text style={styles.inputLabel}>Employee ID</Text>
                    <TextInput style={styles.input} placeholder="e.g. EMP-101" placeholderTextColor="#94a3b8"
                      value={empIDInput} onChangeText={setEmpIDInput} editable={!editingEmp} />

                    <Text style={styles.inputLabel}>Full Name *</Text>
                    <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#94a3b8"
                      value={empNameInput} onChangeText={setEmpNameInput} />

                    <Text style={styles.inputLabel}>Email *</Text>
                    <TextInput style={styles.input} placeholder="email@tvse.com" placeholderTextColor="#94a3b8"
                      value={empEmailInput} onChangeText={setEmpEmailInput} autoCapitalize="none" keyboardType="email-address" />

                    <Text style={styles.inputLabel}>Role</Text>
                    <View style={styles.roleRow}>
                      {(['employee', 'admin'] as const).map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={[styles.roleChip, empRoleInput === r && styles.roleChipActive]}
                          onPress={() => setEmpRoleInput(r)}
                        >
                          <Text style={[styles.roleChipText, empRoleInput === r && styles.roleChipTextActive]}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.btnRow}>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { flex: 1 }, savingEmp && styles.btnDisabled]}
                        onPress={handleSaveEmployee}
                        disabled={savingEmp}
                      >
                        <LinearGradient colors={['#0369a1', '#0284c7']} style={styles.primaryBtnGrad}>
                          {savingEmp ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Save</Text>}
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.outlineBtn, { flex: 1 }]}
                        onPress={() => setShowEmpForm(false)}
                      >
                        <Text style={styles.outlineBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {loadingEmployees ? (
                  <ActivityIndicator color="#0284c7" style={{ marginVertical: 20 }} />
                ) : allEmployees.length === 0 ? (
                  <Text style={styles.emptyText}>No employees found</Text>
                ) : (
                  allEmployees.map((emp) => (
                    <View key={emp.id} style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardName}>{emp.name || 'Unnamed'}</Text>
                          <Text style={styles.cardSub}>{emp.employeeID || emp.id}</Text>
                        </View>
                        <View style={[styles.statusChip, {
                          backgroundColor: emp.role === 'superadmin' ? '#f0fdf4' :
                            emp.role === 'admin' ? '#ede9fe' : '#f0f9ff'
                        }]}>
                          <Text style={[styles.statusChipText, {
                            color: emp.role === 'superadmin' ? '#16a34a' :
                              emp.role === 'admin' ? '#7c3aed' : '#0284c7'
                          }]}>
                            {(emp.role || 'employee').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.attDetail}>📧 {emp.email}</Text>
                      {emp.projectName && <Text style={styles.attDetail}>📁 {emp.projectName}</Text>}
                      <View style={styles.empActionRow}>
                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => {
                            setEditingEmp(emp);
                            setEmpIDInput(emp.employeeID || '');
                            setEmpNameInput(emp.name || '');
                            setEmpEmailInput(emp.email || '');
                            setEmpRoleInput(emp.role === 'admin' ? 'admin' : 'employee');
                            setShowEmpForm(true);
                          }}
                        >
                          <Text style={styles.editBtnText}>✏️ Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDeleteEmployee(emp.id, emp.name || emp.email)}
                        >
                          <Text style={styles.deleteBtnText}>🗑 Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ── ADMIN REQUESTS TAB ── */}
            {activeTab === 'admin_requests' && (
              <View>
                <View style={styles.pageTitleRow}>
                  <Text style={styles.pageTitle}>Leave Requests</Text>
                  <TouchableOpacity style={styles.outlineBtn} onPress={fetchPendingRequests}>
                    <Text style={styles.outlineBtnText}>🔄</Text>
                  </TouchableOpacity>
                </View>

                {loadingRequests ? (
                  <ActivityIndicator color="#0284c7" style={{ marginVertical: 20 }} />
                ) : pendingRequests.length === 0 ? (
                  <Text style={styles.emptyText}>No requests found</Text>
                ) : (
                  pendingRequests.map((req) => (
                    <View key={req.id} style={styles.card}>
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardName}>{req.name || req.email}</Text>
                          <Text style={styles.cardSub}>{req.employeeID}</Text>
                        </View>
                        <View style={[styles.statusChip, { backgroundColor: `${getStatusColor(req.status)}20` }]}>
                          <Text style={[styles.statusChipText, { color: getStatusColor(req.status) }]}>
                            {req.status?.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.attDetail}>
                        {req.type === 'wfh' ? '🏠 WFH' : '📆 Leave'} · {req.startDate}
                        {req.endDate && req.endDate !== req.startDate ? ` → ${req.endDate}` : ''}
                      </Text>
                      {req.reason && <Text style={styles.requestReason}>Reason: {req.reason}</Text>}
                      {req.status === 'pending' && (
                        <View style={styles.approveRejectRow}>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleApproveRequest(req.id)}
                          >
                            <Text style={styles.approveBtnText}>✅ Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rejectBtn}
                            onPress={() => handleRejectRequest(req.id)}
                          >
                            <Text style={styles.rejectBtnText}>❌ Reject</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ── SUPER ADMIN TAB ── */}
            {activeTab === 'superadmin' && (
              <View>
                <Text style={styles.pageTitle}>Super Admin Panel</Text>
                <Text style={styles.pageSub}>Manage projects, office locations & holidays</Text>

                {/* ── Projects Section ── */}
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>🏢 Projects</Text>
                  <Text style={styles.inputLabel}>Project ID (e.g. ITC-LTD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ITC-LTD"
                    placeholderTextColor="#94a3b8"
                    value={newProjId}
                    onChangeText={setNewProjId}
                    autoCapitalize="characters"
                  />
                  <Text style={styles.inputLabel}>Project Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ITC Limited"
                    placeholderTextColor="#94a3b8"
                    value={newProjName}
                    onChangeText={setNewProjName}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateProject}>
                    <LinearGradient colors={['#0369a1', '#0284c7']} style={styles.primaryBtnGrad}>
                      <Text style={styles.primaryBtnText}>+ New Project</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* Add Office Form */}
                {selectedProjForOffice && (
                  <View style={styles.formCard}>
                    <Text style={styles.formCardTitle}>📍 Add Office for {selectedProjForOffice.name}</Text>
                    <Text style={styles.inputLabel}>Office Name</Text>
                    <TextInput style={styles.input} placeholder="e.g. Guindy Office" placeholderTextColor="#94a3b8"
                      value={officeNameInput} onChangeText={setOfficeNameInput} />
                    <Text style={styles.inputLabel}>Latitude</Text>
                    <TextInput style={styles.input} placeholder="e.g. 13.01431" placeholderTextColor="#94a3b8"
                      value={officeLatInput} onChangeText={setOfficeLatInput} keyboardType="numeric" />
                    <Text style={styles.inputLabel}>Longitude</Text>
                    <TextInput style={styles.input} placeholder="e.g. 80.20189" placeholderTextColor="#94a3b8"
                      value={officeLngInput} onChangeText={setOfficeLngInput} keyboardType="numeric" />
                    <Text style={styles.inputLabel}>Geofence Radius (km, default 0.25)</Text>
                    <TextInput style={styles.input} placeholder="0.25" placeholderTextColor="#94a3b8"
                      value={officeRadiusInput} onChangeText={setOfficeRadiusInput} keyboardType="numeric" />
                    <View style={styles.btnRow}>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { flex: 1 }, savingOffice && styles.btnDisabled]}
                        onPress={handleAddOffice}
                        disabled={savingOffice}
                      >
                        <LinearGradient colors={['#0369a1', '#0284c7']} style={styles.primaryBtnGrad}>
                          {savingOffice ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Save Office</Text>}
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.outlineBtn, { flex: 1 }]} onPress={() => setSelectedProjForOffice(null)}>
                        <Text style={styles.outlineBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Projects List */}
                {loadingSuper ? (
                  <ActivityIndicator color="#0284c7" style={{ marginVertical: 20 }} />
                ) : projects.length === 0 ? (
                  <Text style={styles.emptyText}>No projects yet. Create one above.</Text>
                ) : (
                  projects.map((p) => {
                    const projOffices = offices.filter((o: any) => o.projectId === p.id);
                    return (
                      <View key={p.id} style={styles.projectCard}>
                        <View style={styles.projectHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.projectName}>{p.name}</Text>
                            <Text style={styles.projectId}>{p.id}</Text>
                          </View>
                          <View style={styles.projectActions}>
                            <TouchableOpacity
                              style={styles.addOfficeBtn}
                              onPress={() => setSelectedProjForOffice(p)}
                            >
                              <Text style={styles.addOfficeBtnText}>+ Office</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.deleteIconBtn}
                              onPress={() => handleDeleteProject(p.id, p.name)}
                            >
                              <Text style={styles.deleteIconBtnText}>🗑</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        <Text style={styles.officeSectionLabel}>
                          Office Locations ({projOffices.length})
                        </Text>
                        {projOffices.length === 0 ? (
                          <Text style={styles.emptyOfficeText}>No office locations added yet</Text>
                        ) : (
                          projOffices.map((off: any) => (
                            <View key={off.id} style={styles.officeRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.officeName}>{off.name}</Text>
                                <Text style={styles.officeCoords}>
                                  {off.lat?.toFixed(5)}, {off.lng?.toFixed(5)}
                                  {off.radiusKm ? ` · ${(off.radiusKm * 1000).toFixed(0)}m radius` : ''}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleDeleteOffice(off.id, off.name)}
                                style={styles.officeDeleteBtn}
                              >
                                <Text style={styles.officeDeleteText}>🗑</Text>
                              </TouchableOpacity>
                            </View>
                          ))
                        )}
                      </View>
                    );
                  })
                )}

                {/* ── Holidays Section ── */}
                <View style={styles.sectionCard}>
                  <View style={styles.pageTitleRow}>
                    <Text style={styles.sectionTitle}>🗓 Holiday Management</Text>
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => setShowAddHoliday(!showAddHoliday)}
                    >
                      <Text style={styles.addBtnText}>{showAddHoliday ? 'Cancel' : '+ Add'}</Text>
                    </TouchableOpacity>
                  </View>

                  {showAddHoliday && (
                    <View style={styles.formCard}>
                      <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                      <TextInput style={styles.input} placeholder="2024-08-15" placeholderTextColor="#94a3b8"
                        value={hDate} onChangeText={setHDate} />
                      <Text style={styles.inputLabel}>Holiday Name</Text>
                      <TextInput style={styles.input} placeholder="Independence Day" placeholderTextColor="#94a3b8"
                        value={hName} onChangeText={setHName} />
                      <Text style={styles.inputLabel}>Type</Text>
                      <View style={styles.roleRow}>
                        {(['national', 'optional', 'restricted'] as const).map((t) => (
                          <TouchableOpacity
                            key={t}
                            style={[styles.roleChip, hType === t && styles.roleChipActive]}
                            onPress={() => setHType(t)}
                          >
                            <Text style={[styles.roleChipText, hType === t && styles.roleChipTextActive]}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity
                        style={[styles.primaryBtn, savingHoliday && styles.btnDisabled]}
                        onPress={handleAddHoliday}
                        disabled={savingHoliday}
                      >
                        <LinearGradient colors={['#0369a1', '#0284c7']} style={styles.primaryBtnGrad}>
                          {savingHoliday ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Add Holiday</Text>}
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}

                  {loadingHolidays ? (
                    <ActivityIndicator color="#0284c7" />
                  ) : holidays.length === 0 ? (
                    <Text style={styles.emptyOfficeText}>No holidays added yet</Text>
                  ) : (
                    holidays.map((h: any) => (
                      <View key={h.id} style={styles.holidayAdminRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.holidayName}>{h.name}</Text>
                          <Text style={styles.holidayDate}>{h.date} · {h.type}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteHoliday(h.id, h.name)}
                          style={styles.officeDeleteBtn}
                        >
                          <Text style={styles.officeDeleteText}>🗑</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Calendar Styles ──────────────────────────────────────────────────────────
const calStyles = StyleSheet.create({
  grid: { width: '100%' },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    paddingVertical: 4,
  },
  row: { flexDirection: 'row' },
  emptyCell: { flex: 1, height: 46 },
  cell: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    margin: 1,
  },
  todayCell: { backgroundColor: '#0284c7' },
  holidayCell: { backgroundColor: '#fef08a', borderWidth: 1, borderColor: '#facc15' },
  attendanceCell: { backgroundColor: '#bbf7d0' },
  cellText: { fontSize: 13, fontWeight: '500', color: '#1e293b' },
  todayCellText: { color: '#ffffff', fontWeight: '800' },
  holidayCellText: { color: '#92400e', fontWeight: '700' },
  weekendText: { color: '#dc2626' },
  holidayLabel: {
    fontSize: 7,
    color: '#78350f',
    textAlign: 'center',
    marginTop: 1,
    lineHeight: 8,
  },
});

// ─── App Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Splash
  splashContainer: { flex: 1 },
  splashGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  splashSubText: { color: '#94a3b8', fontSize: 14, marginTop: 12 },

  // Container
  container: { flex: 1, backgroundColor: '#0f172a' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tvseLogoText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#38bdf8',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  tvseLogoSubText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#7dd3fc',
    letterSpacing: 1.5,
    marginTop: -2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerUserName: { fontSize: 13, color: '#e2e8f0', fontWeight: '500', maxWidth: 100 },
  superBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  superBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  signOutBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  signOutText: { fontSize: 12, color: '#94a3b8' },

  // Login
  loginScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginContainer: { width: '100%', maxWidth: 400, alignItems: 'center' },
  loginLogoArea: { alignItems: 'center', marginBottom: 32 },
  loginTagline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 12,
    letterSpacing: 0.5,
  },
  loginCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  loginCardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  loginCardSub: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 20,
  },

  // App container
  appContainer: { flex: 1, backgroundColor: '#f8fafc' },

  // Tab bar
  tabBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    maxHeight: 52,
  },
  tabBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  tabText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#ffffff' },

  // Content
  content: { flex: 1 },
  contentInner: { padding: 16 },

  // Page titles
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  pageSub: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },

  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  cardSub: { fontSize: 11, color: '#64748b', marginTop: 1 },

  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  formCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  formCardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },

  // Location
  locationCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  locationCardTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 4 },
  locationCardStatus: { fontSize: 13, color: '#15803d', marginBottom: 4 },
  coordsText: { fontSize: 11, color: '#4b5563', marginBottom: 6 },
  refreshBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  refreshBtnText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },

  // Punch
  punchedInBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'center',
    marginBottom: 10,
  },
  punchedInBadgeText: { fontSize: 14, fontWeight: '800', color: '#16a34a' },
  notPunchedBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'center',
    marginBottom: 10,
  },
  notPunchedBadgeText: { fontSize: 14, fontWeight: '800', color: '#64748b' },
  punchTimeText: { fontSize: 13, color: '#334155', textAlign: 'center', marginBottom: 4 },
  punchProjectText: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 10 },

  // Big buttons
  bigBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  bigBtnText: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 1 },
  btnGreen: { backgroundColor: '#16a34a' },
  btnRed: { backgroundColor: '#dc2626' },

  // History
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyDate: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  historyTime: { fontSize: 11, color: '#64748b' },

  // Status chip
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusChipText: { fontSize: 10, fontWeight: '700' },

  // Calendar
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnText: { fontSize: 22, color: '#0284c7', fontWeight: '700' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },

  calLegend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: 12, color: '#64748b' },

  holidayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  holidayAdminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  holidayName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  holidayDate: { fontSize: 11, color: '#64748b' },
  holidayTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  holidayTypeBadgeText: { fontSize: 10, fontWeight: '700' },

  // Leave
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  typeBtnTextActive: { color: '#ffffff' },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  requestName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  requestReason: { fontSize: 11, color: '#64748b', marginTop: 2 },

  // Approve/Reject
  approveRejectRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  approveBtn: {
    flex: 1,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  rejectBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },

  // Attendance detail
  attDetail: { fontSize: 12, color: '#64748b', marginTop: 3 },

  // Employees
  empActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  editBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  editBtnText: { fontSize: 12, fontWeight: '700', color: '#0284c7' },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },

  addBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },

  // Projects
  projectCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  projectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  projectName: { fontSize: 15, fontWeight: '700', color: '#0369a1' },
  projectId: { fontSize: 11, color: '#64748b', marginTop: 2 },
  projectActions: { flexDirection: 'row', gap: 6 },
  addOfficeBtn: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  addOfficeBtnText: { fontSize: 11, fontWeight: '700', color: '#0284c7' },
  deleteIconBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  deleteIconBtnText: { fontSize: 12 },

  officeSectionLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  emptyOfficeText: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 4 },
  officeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  officeName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  officeCoords: { fontSize: 11, color: '#64748b', marginTop: 2 },
  officeDeleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  officeDeleteText: { fontSize: 14 },

  // Form inputs
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 5 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 10,
  },
  textArea: { height: 80, textAlignVertical: 'top' },

  // Buttons
  primaryBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  primaryBtnGrad: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  btnDisabled: { opacity: 0.6 },

  outlineBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '600', color: '#0284c7' },

  btnRow: { flexDirection: 'row', gap: 8 },
  roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  roleChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roleChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  roleChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  roleChipTextActive: { color: '#ffffff' },

  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginVertical: 20 },
});
