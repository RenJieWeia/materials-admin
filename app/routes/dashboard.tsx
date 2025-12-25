import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
  useFetcher,
  isRouteErrorResponse,
  Link,
} from "react-router";
import { useState, useEffect, useRef } from "react";
import type { Route } from "./+types/dashboard";
import { requireUserId } from "../core/session.server";
import { getUserById } from "../services/user.server";
import {
  recordConversion,
  getConversion,
  getConversions,
  getAllConversions,
  getAllUsersByConversion,
  getSystemTotalConversion,
} from "../services/conversion.server";
import {
  getMaterialUsageStats,
  getTodayUsageCount,
  getAllMaterialUsageStats,
  getMaterialStatusStats,
  getAllUsersByUsage,
  getUsageCountByDate,
  getSystemUsageCountByDate,
  getMaterialGameStats,
  getIdleMaterialGameStats,
  getUserMaterialGameStats,
} from "../services/material.server";
import {
  getTodos,
  createTodo,
  toggleTodo,
  deleteTodo,
} from "../services/todo.server";
import { createAuditLog } from "../services/audit.server";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  ChartBarIcon,
  ComputerDesktopIcon,
  PresentationChartLineIcon,
  UserGroupIcon,
  TrophyIcon,
  FireIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  ListBulletIcon,
  TrashIcon,
  CheckCircleIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const yesterdayObj = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const yesterday = yesterdayObj.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

  // Common Data
  const todayConversion = await getConversion(Number(userId), today);
  const yesterdayConversion = await getConversion(Number(userId), yesterday);
  const todayUsageCount = await getTodayUsageCount(user.name);
  const yesterdayUsageCount = await getUsageCountByDate(user.name, yesterday);

  // Calculate date range for last 30 days for better trend analysis
  const endDate = today;
  const startDateObj = new Date(new Date().getTime() - 29 * 24 * 60 * 60 * 1000);
  const startDate = startDateObj.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

  const conversions = await getConversions(Number(userId), startDate, endDate);
  const usageStats = await getMaterialUsageStats(user.name, startDate, endDate);
  const userGameStats = await getUserMaterialGameStats(user.name);

  // Merge data for charts
  const chartData = [];
  for (
    let d = new Date(startDateObj);
    d <= new Date(today);
    d.setDate(d.getDate() + 1)
  ) {
    const dateStr = d.toLocaleDateString("en-CA");
    const convObj = conversions.find((c) => c.date === dateStr);
    const conv = convObj?.count || 0;
    const pass = convObj?.pass_count || 0;
    const usage = usageStats.find((u) => u.date === dateStr)?.count || 0;
    const rate = pass > 0 ? parseFloat(((conv / pass) * 100).toFixed(2)) : 0;

    chartData.push({
      date: dateStr,
      conversion: conv,
      usage: usage,
      rate: rate,
    });
  }

  // Recent Activity (Last 5 conversions)
  const recentConversions = conversions.slice(0, 5);

  let adminData = null;
  if (user.role === "admin") {
    const allUsage = await getAllMaterialUsageStats(startDate, endDate);
    const allConversions = await getAllConversions(startDate, endDate);
    const statusStats = await getMaterialStatusStats();
    const usersUsageRanking = await getAllUsersByUsage(startDate, endDate);
    const usersConversionRanking = await getAllUsersByConversion(
      startDate,
      endDate
    );

    // System Totals
    const systemTodayConversion = await getSystemTotalConversion(today);
    const systemYesterdayConversion = await getSystemTotalConversion(yesterday);
    const systemTodayUsage = await getSystemUsageCountByDate(today);
    const systemYesterdayUsage = await getSystemUsageCountByDate(yesterday);
    const todos = await getTodos(Number(userId));
    const systemGameStats = await getMaterialGameStats();
    const idleGameStats = await getIdleMaterialGameStats();

    const adminChartData = [];
    for (
      let d = new Date(startDateObj);
      d <= new Date(today);
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toLocaleDateString("en-CA");
      const convObj = allConversions.find((c) => c.date === dateStr);
      const conv = convObj?.count || 0;
      const pass = convObj?.pass_count || 0;
      const usage = allUsage.find((u) => u.date === dateStr)?.count || 0;
      const rate = pass > 0 ? parseFloat(((conv / pass) * 100).toFixed(2)) : 0;

      adminChartData.push({
        date: dateStr,
        conversion: conv,
        usage: usage,
        rate: rate,
      });
    }

    adminData = {
      chartData: adminChartData,
      statusStats,
      usersUsageRanking,
      usersConversionRanking,
      systemTodayConversion,
      systemYesterdayConversion,
      systemTodayUsage,
      systemYesterdayUsage,
      idleGameStats,
      systemGameStats,
      todos,
    };
  }

  return {
    user,
    todayConversion,
    yesterdayConversion,
    today,
    todayUsageCount,
    yesterdayUsageCount,
    chartData,
    recentConversions,
    userGameStats,
    adminData,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "record_conversion") {
    const count = parseInt(formData.get("count") as string);
    const passCount = parseInt(formData.get("passCount") as string) || 0;
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }); // Always record for today in UTC+8

    if (isNaN(count) || count < 0) {
      return { error: "请输入有效的数量" };
    }

    if (passCount < 0 || count > passCount) {
      return { error: "转化数量不能大于通过数量" };
    }

    await recordConversion(Number(userId), date, count, passCount);
    createAuditLog({
      user_id: Number(userId),
      user_name: user?.name,
      action: "登记转化",
      entity: "转化记录",
      details: `登记转化数据: ${count}/${passCount} (日期: ${date})`,
    }, request);
    return { success: true, message: "登记成功" };
  }

  if (intent === "add_todo") {
    const text = formData.get("text") as string;
    if (!text || text.trim() === "") {
      return { error: "请输入待办事项内容" };
    }
    await createTodo(Number(userId), text);
    createAuditLog({
      user_id: Number(userId),
      user_name: user?.name,
      action: "创建待办",
      entity: "待办事项",
      details: `创建待办事项: ${text}`,
    }, request);
    return { success: true };
  }

  if (intent === "toggle_todo") {
    const id = parseInt(formData.get("todoId") as string);
    await toggleTodo(id, Number(userId));
    createAuditLog({
      user_id: Number(userId),
      user_name: user?.name,
      action: "切换待办状态",
      entity: "待办事项",
      entity_id: id.toString(),
      details: `切换待办事项状态 ID: ${id}`,
    }, request);
    return { success: true };
  }

  if (intent === "delete_todo") {
    const id = parseInt(formData.get("todoId") as string);
    await deleteTodo(id, Number(userId));
    createAuditLog({
      user_id: Number(userId),
      user_name: user?.name,
      action: "删除待办",
      entity: "待办事项",
      entity_id: id.toString(),
      details: `删除待办事项 ID: ${id}`,
    }, request);
    return { success: true };
  }

  return null;
}

function TrendIndicator({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  if (previous === 0)
    return <span className="text-slate-400 text-xs">无昨日数据</span>;
  const diff = current - previous;
  const percent = ((diff / previous) * 100).toFixed(1);
  const isPositive = diff > 0;
  const isZero = diff === 0;

  if (isZero)
    return (
      <span className="text-slate-500 text-xs font-medium">与昨日持平</span>
    );

  return (
    <div
      className={`flex items-center text-xs font-medium ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
    >
      {isPositive ? (
        <ArrowTrendingUpIcon className="w-3 h-3 mr-1" />
      ) : (
        <ArrowTrendingDownIcon className="w-3 h-3 mr-1" />
      )}
      <span>{Math.abs(Number(percent))}%</span>
      <span className="ml-1 text-slate-400">较昨日</span>
    </div>
  );
}

export default function Dashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    user,
    todayConversion,
    yesterdayConversion,
    today,
    todayUsageCount,
    yesterdayUsageCount,
    chartData,
    recentConversions,
    userGameStats,
    adminData,
  } = loaderData;

  const addTodoFetcher = useFetcher();
  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addTodoFetcher.state === "submitting") {
      addFormRef.current?.reset();
    }
  }, [addTodoFetcher.state]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rankingTab, setRankingTab] = useState<
    "conversion" | "usage" | "passRate"
  >("conversion");
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (actionData?.success) {
      setIsModalOpen(false);
      formRef.current?.reset();
    }
  }, [actionData]);

  // Professional Business Palette
  const COLORS = ["#2563eb", "#0d9488", "#d97706", "#4f46e5", "#be123c"];

  if (user.role === "admin" && adminData) {
    return (
      <div className="p-6 container mx-auto text-slate-800 dark:text-slate-200 space-y-6 bg-gray-50/50 dark:bg-gray-900 min-h-screen">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
              <Squares2X2Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                管理工作台
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                全平台数据概览与分析
              </p>
            </div>
          </div>
          <div className="text-xs font-medium px-3 py-1.5 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm">
            {new Date().toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </div>
        </div>

        {/* Admin KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  今日总转化
                </p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
                  {adminData.systemTodayConversion.count}
                </h3>
              </div>
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                <ChartBarIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <TrendIndicator
              current={adminData.systemTodayConversion.count}
              previous={adminData.systemYesterdayConversion.count}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30 p-1.5 rounded-md border border-slate-100 dark:border-slate-700">
              <div className="flex items-center">
                <span>通过: </span>
                <span className="ml-1 font-semibold text-slate-700 dark:text-slate-300">
                  {adminData.systemTodayConversion.pass_count}
                </span>
              </div>
              <div className="flex items-center">
                <span>率: </span>
                <span className="ml-1 font-semibold text-slate-700 dark:text-slate-300">
                  {adminData.systemTodayUsage > 0
                    ? (
                        (adminData.systemTodayConversion.pass_count /
                          adminData.systemTodayUsage) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  今日总使用
                </p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
                  {adminData.systemTodayUsage}
                </h3>
              </div>
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                <ComputerDesktopIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <TrendIndicator
              current={adminData.systemTodayUsage}
              previous={adminData.systemYesterdayUsage}
            />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  今日转化率
                </p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
                  {adminData.systemTodayConversion.pass_count > 0
                    ? (
                        (adminData.systemTodayConversion.count /
                          adminData.systemTodayConversion.pass_count) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </h3>
              </div>
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                <ArrowTrendingUpIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <div className="text-xs text-slate-500">全平台平均水平</div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  库存账号数
                </p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
                  {adminData.statusStats
                    .filter((s: any) => s.status === "空闲")
                    .reduce((acc: number, curr: any) => acc + curr.count, 0)}
                </h3>
              </div>
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                <UserGroupIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <div className="text-xs text-slate-500">系统空闲账号</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Global Trend */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  全平台趋势分析 (30天)
                </h2>
              </div>
            </div>
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={adminData.chartData}>
                  <defs>
                    <linearGradient
                      id="colorConversion"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={(val) => val.slice(5)}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      color: "#f8fafc",
                      borderRadius: "0.375rem",
                      border: "1px solid #334155",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                  />
                  <Legend wrapperStyle={{ paddingTop: "20px" }} />
                  <Area
                    type="monotone"
                    dataKey="conversion"
                    name="总转化数"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorConversion)"
                  />
                  <Area
                    type="monotone"
                    dataKey="usage"
                    name="总账号使用"
                    stroke="#0d9488"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorUsage)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Todo List */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
                待办清单
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 space-y-2 pr-2 custom-scrollbar">
              {adminData.todos && adminData.todos.length > 0 ? (
                adminData.todos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded group"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Form
                        method="post"
                        className="flex items-center"
                        preventScrollReset
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="toggle_todo"
                        />
                        <input type="hidden" name="todoId" value={todo.id} />
                        <button
                          type="submit"
                          className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
                        >
                          {todo.completed ? (
                            <CheckCircleIcon className="w-5 h-5 text-green-500" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-500" />
                          )}
                        </button>
                      </Form>
                      <span
                        className={`text-sm ${todo.completed ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}
                      >
                        {todo.text}
                      </span>
                    </div>
                    <Form method="post" preventScrollReset>
                      <input type="hidden" name="intent" value="delete_todo" />
                      <input type="hidden" name="todoId" value={todo.id} />
                      <button
                        type="submit"
                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </Form>
                  </div>
                ))
              ) : (
                <div className="text-center text-slate-400 py-8 text-sm">
                  暂无待办事项
                </div>
              )}
            </div>

            <addTodoFetcher.Form
              method="post"
              className="mt-auto"
              ref={addFormRef}
            >
              <input type="hidden" name="intent" value="add_todo" />
              <div className="flex gap-2">
                <input
                  type="text"
                  name="text"
                  placeholder="添加新的待办事项..."
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-md bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50"
                  disabled={addTodoFetcher.state === "submitting"}
                >
                  {addTodoFetcher.state === "submitting" ? "添加中..." : "添加"}
                </button>
              </div>
            </addTodoFetcher.Form>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Game Distribution */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 h-96 flex flex-col">
            <div className="flex items-center mb-4 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
                游戏分布
              </h2>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={adminData.systemGameStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="game_name"
                  >
                    {adminData.systemGameStats.map(
                      (entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                          strokeWidth={0}
                        />
                      )
                    )}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      color: "#f8fafc",
                      borderRadius: "0.375rem",
                      border: "1px solid #334155",
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Conversion Rate Trend */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 h-96 flex flex-col">
            <div className="flex items-center mb-4 flex-shrink-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
                转化率趋势
              </h2>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={adminData.chartData}>
                  <defs>
                    <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d97706" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={(val) => val.slice(5)}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    dx={-10}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      color: "#f8fafc",
                      borderRadius: "0.375rem",
                      border: "1px solid #334155",
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    name="转化率"
                    stroke="#d97706"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRate)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Combined Rankings */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 flex flex-col h-96">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center">
                <div
                  className={`p-1.5 rounded-md border mr-3 transition-colors ${
                    rankingTab === "conversion"
                      ? "bg-amber-50 border-amber-100 text-amber-500 dark:bg-amber-900/20 dark:border-amber-800"
                      : rankingTab === "usage"
                        ? "bg-rose-50 border-rose-100 text-rose-500 dark:bg-rose-900/20 dark:border-rose-800"
                        : "bg-emerald-50 border-emerald-100 text-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-800"
                  }`}
                >
                  {rankingTab === "conversion" ? (
                    <TrophyIcon className="w-4 h-4" />
                  ) : rankingTab === "usage" ? (
                    <FireIcon className="w-4 h-4" />
                  ) : (
                    <CheckCircleIcon className="w-4 h-4" />
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  {rankingTab === "conversion"
                    ? "转化排行榜"
                    : rankingTab === "usage"
                      ? "勤奋排行榜"
                      : "通过率排行"}
                </h2>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1">
                <button
                  onClick={() => setRankingTab("conversion")}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${rankingTab === "conversion" ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  转化
                </button>
                <button
                  onClick={() => setRankingTab("usage")}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${rankingTab === "usage" ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  勤奋
                </button>
                <button
                  onClick={() => setRankingTab("passRate")}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${rankingTab === "passRate" ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
                >
                  通过率
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {(() => {
                let data = [];
                if (rankingTab === "conversion") {
                  data = adminData.usersConversionRanking;
                } else if (rankingTab === "usage") {
                  data = adminData.usersUsageRanking;
                } else {
                  data = [...adminData.usersConversionRanking]
                    .map((u: any) => {
                      const usageUser = adminData.usersUsageRanking.find(
                        (usage: any) => usage.user === u.user
                      );
                      const usageCount = usageUser ? usageUser.count : 0;
                      return {
                        ...u,
                        rate:
                          usageCount > 0
                            ? (u.pass_count / usageCount) * 100
                            : 0,
                      };
                    })
                    .sort((a: any, b: any) => b.rate - a.rate);
                }

                return data.map((item: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30 mb-2 last:mb-0 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
                        ${
                          index === 0
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 ring-1 ring-yellow-200 dark:ring-yellow-500/30"
                            : index === 1
                              ? "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-500"
                              : index === 2
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-500/30"
                                : "bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-600"
                        }
                      `}
                      >
                        {index + 1}
                      </div>
                      <span
                        className={`text-sm font-medium ${index < 3 ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`}
                      >
                        {item.user}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        index < 3
                          ? rankingTab === "conversion"
                            ? "text-blue-600 dark:text-blue-400"
                            : rankingTab === "usage"
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {rankingTab === "passRate"
                        ? `${item.rate.toFixed(1)}%`
                        : item.count}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 container mx-auto text-slate-800 dark:text-slate-200 space-y-6 bg-gray-50/50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
            <Squares2X2Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              工作台
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              欢迎回来，{user.name}
            </p>
          </div>
        </div>
        <div className="text-xs font-medium px-3 py-1.5 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm">
          {new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Today Conversion Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <ChartBarIcon className="w-20 h-20 text-slate-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-700 dark:text-slate-300">
                今日转化
              </h2>
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                <ChartBarIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              {todayConversion?.count || 0}
            </div>
            <TrendIndicator
              current={todayConversion?.count || 0}
              previous={yesterdayConversion?.count || 0}
            />

            <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30 p-2 rounded-md border border-slate-100 dark:border-slate-700">
              <div className="flex items-center">
                <CheckCircleIcon className="w-3 h-3 mr-2 text-emerald-500" />
                <span>通过: </span>
                <span className="ml-1 font-semibold text-slate-700 dark:text-slate-300">
                  {todayConversion?.pass_count || 0}
                </span>
              </div>
              <div className="flex items-center">
                <span>率: </span>
                <span className="ml-1 font-semibold text-slate-700 dark:text-slate-300">
                  {todayUsageCount > 0
                    ? (
                        ((todayConversion?.pass_count || 0) / todayUsageCount) *
                        100
                      ).toFixed(1)
                    : 0}
                  %
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98] text-sm"
            >
              <PlusIcon className="w-4 h-4" />
              <span>转化登记</span>
            </button>
          </div>
        </div>

        {/* Today Usage Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <ComputerDesktopIcon className="w-20 h-20 text-slate-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-700 dark:text-slate-300">
                今日账号使用
              </h2>
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
                <ComputerDesktopIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              {todayUsageCount}
            </div>
            <TrendIndicator
              current={todayUsageCount}
              previous={yesterdayUsageCount}
            />

            <div className="mt-4 flex items-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/30 p-2 rounded-md border border-slate-100 dark:border-slate-700">
              <ArrowTrendingUpIcon className="w-3 h-3 mr-2 text-slate-400" />
              <span>今日转化率: </span>
              <span className="ml-1 font-semibold text-slate-700 dark:text-slate-300">
                {(todayConversion?.pass_count || 0) > 0
                  ? (
                      ((todayConversion?.count || 0) /
                        (todayConversion?.pass_count || 0)) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </span>
            </div>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-700 dark:text-slate-300">
              近期动态
            </h2>
            <div className="p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-md border border-slate-100 dark:border-slate-600">
              <ClockIcon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
          <div className="space-y-3">
            {recentConversions.length > 0 ? (
              recentConversions.slice(0, 3).map((conv: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-700/50 pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center text-slate-600 dark:text-slate-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></div>
                    <span>转化登记</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-end">
                      <span className="font-medium text-slate-900 dark:text-white">
                        +{conv.count}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                        (通{conv.pass_count || 0})
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(conv.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 text-center py-4">
                暂无近期记录
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">近30日总转化</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {chartData.reduce(
                    (acc: number, curr: any) => acc + curr.conversion,
                    0
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversion Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center mb-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              近30日转化趋势
            </h2>
          </div>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient
                    id="colorUserConversion"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorUserUsage"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(val) => val.slice(5)}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                    color: "#f8fafc",
                    borderRadius: "0.375rem",
                    border: "1px solid #334155",
                  }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
                <Area
                  type="monotone"
                  dataKey="conversion"
                  name="转化数"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUserConversion)"
                />
                <Area
                  type="monotone"
                  dataKey="usage"
                  name="账号使用数"
                  stroke="#0d9488"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUserUsage)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Game Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center mb-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              常用游戏分布
            </h2>
          </div>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={userGameStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="game_name"
                >
                  {userGameStats.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      strokeWidth={0}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                    color: "#f8fafc",
                    borderRadius: "0.375rem",
                    border: "1px solid #334155",
                  }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Legend
                  layout="vertical"
                  verticalAlign="middle"
                  align="center"
                  wrapperStyle={{ paddingTop: "20px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Rate Trend */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center mb-4">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">
              近30日转化率趋势
            </h2>
          </div>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(val) => val.slice(5)}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    borderColor: "#334155",
                    color: "#f8fafc",
                    borderRadius: "0.375rem",
                    border: "1px solid #334155",
                  }}
                  itemStyle={{ color: "#f8fafc" }}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="转化率"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity"
                onClick={() => setIsModalOpen(false)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-lg bg-white dark:bg-slate-800 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:align-middle border border-slate-200 dark:border-slate-700">
              <div className="bg-white dark:bg-slate-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-bold leading-6 text-slate-900 dark:text-white mb-6">
                  登记今日转化 ({today})
                </h3>
                <Form method="post" ref={formRef}>
                  <input
                    type="hidden"
                    name="intent"
                    value="record_conversion"
                  />
                  <div className="mb-6">
                    <label
                      htmlFor="count"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                    >
                      转化数量
                    </label>
                    <input
                      type="number"
                      name="count"
                      id="count"
                      defaultValue={todayConversion?.count}
                      min="0"
                      required
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="请输入数量"
                    />
                  </div>
                  <div className="mb-6">
                    <label
                      htmlFor="passCount"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
                    >
                      通过数量
                    </label>
                    <input
                      type="number"
                      name="passCount"
                      id="passCount"
                      defaultValue={todayConversion?.pass_count}
                      min="0"
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="请输入通过数量"
                    />
                  </div>
                  {actionData?.error && (
                    <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-600 dark:text-rose-400 rounded-md">
                      {actionData.error}
                    </div>
                  )}
                  <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-2 sm:text-sm disabled:opacity-50 transition-colors"
                    >
                      {isSubmitting ? "保存中..." : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="mt-3 inline-flex w-full justify-center rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-base font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </Form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "工作台发生错误";
  let message = "加载数据时遇到未知问题，请稍后重试。";
  let details = "";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} - ${error.statusText}`;
    message = error.data || "请求的资源不存在或无权访问。";
  } else if (error instanceof Error) {
    message = error.message;
    details = error.stack || "";
  }

  return (
    <div className="p-8 container mx-auto text-center">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 inline-block max-w-2xl w-full">
        <h1 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-4">
          {title}
        </h1>
        <p className="text-gray-700 dark:text-gray-300 mb-4">{message}</p>
        {details && (
          <details className="text-left mt-4">
            <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              查看详细错误信息
            </summary>
            <pre className="mt-2 p-4 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-auto text-gray-800 dark:text-gray-200 max-h-64">
              {details}
            </pre>
          </details>
        )}
        <div className="mt-6">
          <a
            href="/dashboard"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            刷新页面
          </a>
        </div>
      </div>
    </div>
  );
}
