import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, isWeekend } from "date-fns";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { ProjectPicker, useAvailableProjects } from "@/components/ProjectPicker";
import { 
  Users, CalendarCheck, Clock, FileSpreadsheet, AlertCircle, ChevronLeft, ChevronRight, BarChart3, TrendingUp, Compass, Award
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

export const Route = createFileRoute("/admin/dashboard")({
  component: () => (
    <RequireAuth role="staff">
      <MonthlyDashboard />
    </RequireAuth>
  ),
});

interface Employee {
  id: string;
  employeeID: string;
  name: string;
  email: string;
  role: string;
  projectId?: string | null;
  projectName?: string | null;
}

interface AttendanceRecord {
  id: string;
  uid: string;
  employeeID: string;
  name: string;
  email: string;
  date: string;
  time: string;
  punchOutTime?: string;
  status?: string;
  projectId?: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444"]; // Present, WFH, On Duty, Leave

function MonthlyDashboard() {
  const { profile, activeProjectId, setActiveProjectId, adminProjectIds } = useAuth();
  const isSuper = profile?.role === "superadmin";
  const { projects } = useAvailableProjects();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Month/Year state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const yearString = format(currentDate, "yyyy");
  const monthString = format(currentDate, "MM");

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleMonthChange = (val: string) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), parseInt(val) - 1, 1));
  };

  const handleYearChange = (val: string) => {
    setCurrentDate((prev) => new Date(parseInt(val), prev.getMonth(), 1));
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const scopeIds = activeProjectId
          ? [activeProjectId]
          : isSuper
          ? []
          : adminProjectIds;

        // Fetch employees in scope
        const empSnaps = await Promise.all(
          isSuper && scopeIds.length === 0
            ? [getDocs(collection(db, "employees"))]
            : [
                ...chunk(scopeIds, 10).map((ids) =>
                  getDocs(query(collection(db, "employees"), where("projectIds", "array-contains-any", ids))),
                ),
                ...chunk(scopeIds, 30).map((ids) =>
                  getDocs(query(collection(db, "employees"), where("projectId", "in", ids))),
                ),
              ],
        );

        // Fetch attendance records in scope
        const attSnaps = await Promise.all(
          isSuper && scopeIds.length === 0
            ? [getDocs(collection(db, "attendance"))]
            : chunk(scopeIds, 30).map((ids) =>
                getDocs(query(collection(db, "attendance"), where("projectId", "in", ids))),
              ),
        );

        // Map and set employees (only show 'employee' role for statistics)
        const empMap = new Map<string, Employee>();
        empSnaps.flatMap((s) => s.docs).forEach((d) => {
          const data = d.data() as Omit<Employee, "id">;
          if (data.role === "employee") {
            empMap.set(d.id, { id: d.id, ...data });
          }
        });
        const emps = Array.from(empMap.values());
        setEmployees(emps);

        // Map and set attendance
        const atts = attSnaps.flatMap((s) =>
          s.docs.map((d) => {
            const data = d.data() as AttendanceRecord;
            return {
              id: d.id,
              uid: data.uid,
              employeeID: data.employeeID ?? "",
              name: data.name ?? "",
              email: data.email ?? "",
              date: data.date ?? "",
              time: data.time ?? "",
              punchOutTime: data.punchOutTime,
              status: data.status || "present",
              projectId: data.projectId ?? null,
            };
          }),
        );
        setAttendance(atts);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuper, activeProjectId, adminProjectIds.join("|")]);

  // Utility to calculate hours worked between two HH:MM:SS times
  const calculateHours = (inTime?: string, outTime?: string) => {
    if (!inTime || !outTime) return 0;
    try {
      const [h1, m1, s1] = inTime.split(":").map(Number);
      const [h2, m2, s2] = outTime.split(":").map(Number);
      const d1 = new Date(2000, 0, 1, h1, m1, s1 || 0);
      const d2 = new Date(2000, 0, 1, h2, m2, s2 || 0);
      const diffMs = d2.getTime() - d1.getTime();
      return diffMs > 0 ? Number((diffMs / (1000 * 60 * 60)).toFixed(2)) : 0;
    } catch {
      return 0;
    }
  };

  // Process data for the selected month/year
  const monthData = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const daysInMonth = eachDayOfInterval({ start, end });

    // Filter attendance records to the current month
    const currentMonthAtts = attendance.filter((a) => {
      if (!a.date) return false;
      const recDate = parseISO(a.date);
      return recDate >= start && recDate <= end;
    });

    // Calculate daily metrics
    const dailyStats = daysInMonth.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayAtts = currentMonthAtts.filter((a) => a.date === dateStr);

      const present = dayAtts.filter((a) => a.status === "present").length;
      const wfh = dayAtts.filter((a) => a.status === "wfh").length;
      const onDuty = dayAtts.filter((a) => a.status === "on_duty").length;
      const leave = dayAtts.filter((a) => a.status === "leave").length;

      return {
        date: dateStr,
        dayLabel: format(day, "dd"),
        present,
        wfh,
        onDuty,
        leave,
        totalActive: present + wfh + onDuty,
        isWeekend: isWeekend(day),
      };
    });

    // Calculate individual employee summary table
    const employeeSummaries = employees.map((emp) => {
      const empAtts = currentMonthAtts.filter((a) => a.uid === emp.id);

      const present = empAtts.filter((a) => a.status === "present").length;
      const wfh = empAtts.filter((a) => a.status === "wfh").length;
      const onDuty = empAtts.filter((a) => a.status === "on_duty").length;
      const leave = empAtts.filter((a) => a.status === "leave").length;

      // Workday counts (excluding weekends unless punched)
      let totalWorkdays = 0;
      let absent = 0;

      daysInMonth.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const punched = empAtts.some((a) => a.date === dateStr);
        if (!isWeekend(day)) {
          totalWorkdays++;
          if (!punched) {
            absent++;
          }
        } else if (punched) {
          // if they worked on weekend, count it
          totalWorkdays++;
        }
      });

      // Calculate working hours
      const workHours = empAtts.map((a) => calculateHours(a.time, a.punchOutTime));
      const totalHours = workHours.reduce((sum, h) => sum + h, 0);
      const avgHours = empAtts.length > 0 ? Number((totalHours / empAtts.length).toFixed(1)) : 0;

      // Calculate average punch-in time
      let avgPunchIn = "N/A";
      const validPunchTimes = empAtts.filter((a) => a.time && a.status !== "leave");
      if (validPunchTimes.length > 0) {
        let totalMinutes = 0;
        validPunchTimes.forEach((a) => {
          const [h, m] = a.time.split(":").map(Number);
          totalMinutes += h * 60 + m;
        });
        const avgMin = Math.round(totalMinutes / validPunchTimes.length);
        const avgH = Math.floor(avgMin / 60);
        const avgM = avgMin % 60;
        avgPunchIn = `${String(avgH).padStart(2, "0")}:${String(avgM).padStart(2, "0")}`;
      }

      return {
        id: emp.id,
        employeeID: emp.employeeID,
        name: emp.name,
        email: emp.email,
        projectName: emp.projectName || "Unassigned",
        present,
        wfh,
        onDuty,
        leave,
        absent,
        avgHours,
        avgPunchIn,
        attendanceRate: totalWorkdays > 0 ? Math.round(((totalWorkdays - absent) / totalWorkdays) * 100) : 0,
      };
    });

    // KPI Aggregates
    const activeDaysCount = dailyStats.filter((d) => !d.isWeekend).length;
    const expectedManDays = employees.length * activeDaysCount;

    const totalPresent = currentMonthAtts.filter((a) => a.status === "present").length;
    const totalWFH = currentMonthAtts.filter((a) => a.status === "wfh").length;
    const totalOnDuty = currentMonthAtts.filter((a) => a.status === "on_duty").length;
    const totalLeave = currentMonthAtts.filter((a) => a.status === "leave").length;
    const totalPunched = totalPresent + totalWFH + totalOnDuty;

    const overallAttendanceRate = expectedManDays > 0 
      ? Math.min(100, Math.round((totalPunched / expectedManDays) * 100)) 
      : 0;

    // Working hours statistics
    const totalHoursWorked = currentMonthAtts.reduce((sum, a) => sum + calculateHours(a.time, a.punchOutTime), 0);
    const avgMonthlyHours = totalPunched > 0 ? Number((totalHoursWorked / totalPunched).toFixed(1)) : 0;

    // Status breakdown chart data
    const pieData = [
      { name: "Office", value: totalPresent },
      { name: "WFH", value: totalWFH },
      { name: "On Duty", value: totalOnDuty },
      { name: "Leave", value: totalLeave },
    ].filter((item) => item.value > 0);

    return {
      dailyStats,
      employeeSummaries,
      overallAttendanceRate,
      totalPunched,
      totalLeave,
      totalWFH,
      totalOnDuty,
      avgMonthlyHours,
      pieData,
    };
  }, [currentDate, employees, attendance]);

  // Apply search filtering on employee table
  const filteredSummaries = useMemo(() => {
    if (!searchQuery) return monthData.employeeSummaries;
    const q = searchQuery.toLowerCase();
    return monthData.employeeSummaries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employeeID.toLowerCase().includes(q) ||
        e.projectName.toLowerCase().includes(q)
    );
  }, [monthData.employeeSummaries, searchQuery]);

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Monthly Overview Statistics
    const summaryData = [
      { Metric: "Dashboard Month", Value: format(currentDate, "MMMM yyyy") },
      { Metric: "Project Filter", Value: activeProjectId || "All Projects" },
      { Metric: "Total Employees", Value: employees.length },
      { Metric: "Overall Monthly Attendance Rate", Value: `${monthData.overallAttendanceRate}%` },
      { Metric: "Average Daily Working Hours", Value: `${monthData.avgMonthlyHours} hrs` },
      { Metric: "Total On-Site Punches", Value: monthData.totalPunched - monthData.totalWFH - monthData.totalOnDuty },
      { Metric: "Total WFH Days Taken", Value: monthData.totalWFH },
      { Metric: "Total On-Duty Days Taken", Value: monthData.totalOnDuty },
      { Metric: "Total Leave Days Taken", Value: monthData.totalLeave },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "Overview");

    // Sheet 2: Employee Breakdown
    const empRows = monthData.employeeSummaries.map((e) => ({
      "Employee ID": e.employeeID,
      Name: e.name,
      Email: e.email,
      Project: e.projectName,
      "Attendance Rate (%)": e.attendanceRate,
      "Present Days": e.present,
      "WFH Days": e.wfh,
      "On Duty Days": e.onDuty,
      "Leave Days": e.leave,
      "Absent Days": e.absent,
      "Avg. Daily Hours": e.avgHours,
      "Avg. Punch-In Time": e.avgPunchIn,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows), "Employee Summaries");

    // Save Workbook
    const filename = `Monthly-Attendance-Report-${format(currentDate, "yyyy-MM")}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Excel report generated successfully!");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Monthly Attendance Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview, daily trends, work hours distribution, and detailed employee records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProjectPicker projects={projects} value={activeProjectId} onChange={setActiveProjectId} />
          
          <Button size="sm" variant="outline" onClick={handleExportExcel} className="h-9 gap-1.5 shadow-sm">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export Report</span>
          </Button>
        </div>
      </div>

      {/* Period Selector Controls */}
      <Card className="shadow-sm border-muted">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4 px-6">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={handlePrevMonth} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-bold min-w-[120px] text-center">
              {format(currentDate, "MMMM yyyy")}
            </span>
            <Button size="icon" variant="ghost" onClick={handleNextMonth} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Select value={monthString} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[120px] h-9 shadow-sm">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, i) => {
                  const m = String(i + 1).padStart(2, "0");
                  return (
                    <SelectItem key={m} value={m}>
                      {format(new Date(2000, i, 1), "MMMM")}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select value={yearString} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[100px] h-9 shadow-sm">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {["2024", "2025", "2026", "2027"].map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-indigo-50 p-3.5 text-indigo-600 dark:bg-indigo-950/50">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Rate</p>
              <p className="text-2xl font-bold mt-0.5">{monthData.overallAttendanceRate}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Expected vs punched days</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-emerald-50 p-3.5 text-emerald-600 dark:bg-emerald-950/50">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg. Daily Hours</p>
              <p className="text-2xl font-bold mt-0.5">{monthData.avgMonthlyHours} hrs</p>
              <p className="text-xs text-muted-foreground mt-0.5">Average time per punch</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-amber-50 p-3.5 text-amber-600 dark:bg-amber-950/50">
              <Compass className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">WFH / On Duty Days</p>
              <p className="text-2xl font-bold mt-0.5">{monthData.totalWFH + monthData.totalOnDuty}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{monthData.totalWFH} WFH · {monthData.totalOnDuty} On Duty</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-rose-50 p-3.5 text-rose-600 dark:bg-rose-950/50">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leaves Recorded</p>
              <p className="text-2xl font-bold mt-0.5">{monthData.totalLeave} Days</p>
              <p className="text-xs text-muted-foreground mt-0.5">Paid / Approved leaves</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visual Charts Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Trend Chart (2/3 width on wide screens) */}
        <Card className="lg:col-span-2 shadow-sm border-muted">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Daily Attendance Trend</CardTitle>
                <CardDescription>Daily punch counts across the month</CardDescription>
              </div>
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pt-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading trend...</div>
            ) : monthData.dailyStats.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No records to display.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData.dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="dayLabel" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={30} />
                  <Tooltip cursor={{ fill: "rgba(0, 0, 0, 0.05)" }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="present" name="Office" fill="#10B981" stackId="status" />
                  <Bar dataKey="wfh" name="WFH" fill="#3B82F6" stackId="status" />
                  <Bar dataKey="onDuty" name="On Duty" fill="#F59E0B" stackId="status" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Breakdown (1/3 width) */}
        <Card className="shadow-sm border-muted">
          <CardHeader>
            <CardTitle className="text-lg">Status Distribution</CardTitle>
            <CardDescription>Overall breakdown of all activities</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col justify-between pt-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading chart...</div>
            ) : monthData.pieData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No activities recorded.</div>
            ) : (
              <div className="relative h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={monthData.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {monthData.pieData.map((entry, index) => {
                        const colorsMap: Record<string, string> = {
                          Office: COLORS[0],
                          WFH: COLORS[1],
                          "On Duty": COLORS[2],
                          Leave: COLORS[3],
                        };
                        return <Cell key={`cell-${index}`} fill={colorsMap[entry.name] || "#CBD5E1"} />;
                      })}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} days`, "Activity"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#10B981]" />
                <span>Office ({monthData.totalPunched - monthData.totalWFH - monthData.totalOnDuty})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#3B82F6]" />
                <span>WFH ({monthData.totalWFH})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#F59E0B]" />
                <span>On Duty ({monthData.totalOnDuty})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#EF4444]" />
                <span>Leave ({monthData.totalLeave})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee aggregate summary table */}
      <Card className="shadow-sm border-muted">
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Employee Summary</CardTitle>
            <CardDescription>Aggregate metrics per employee for {format(currentDate, "MMMM yyyy")}</CardDescription>
          </div>
          <div className="w-[260px]">
            <Input
              placeholder="Search employee or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading employee overview...</div>
          ) : filteredSummaries.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No employees found matching the filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-center">Rate (%)</TableHead>
                    <TableHead className="text-center">Present</TableHead>
                    <TableHead className="text-center">WFH</TableHead>
                    <TableHead className="text-center">On Duty</TableHead>
                    <TableHead className="text-center">Leaves</TableHead>
                    <TableHead className="text-center">Absents</TableHead>
                    <TableHead className="text-right">Avg Hours</TableHead>
                    <TableHead className="text-right">Avg Punch-In</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummaries.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-mono text-xs font-semibold">{emp.employeeID}</TableCell>
                      <TableCell>
                        <div className="font-medium">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
                      </TableCell>
                      <TableCell className="text-xs">{emp.projectName}</TableCell>
                      <TableCell className="text-center font-bold">
                        <span className={
                          emp.attendanceRate >= 90 ? "text-emerald-600" :
                          emp.attendanceRate >= 75 ? "text-amber-600" : "text-rose-600"
                        }>
                          {emp.attendanceRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">{emp.present}</TableCell>
                      <TableCell className="text-center">{emp.wfh}</TableCell>
                      <TableCell className="text-center">{emp.onDuty}</TableCell>
                      <TableCell className="text-center text-rose-600 font-semibold">{emp.leave}</TableCell>
                      <TableCell className="text-center text-amber-600 font-semibold">{emp.absent}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{emp.avgHours}h</TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">{emp.avgPunchIn}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
