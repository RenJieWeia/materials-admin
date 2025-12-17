import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
  isRouteErrorResponse,
} from "react-router";
import { useState, useEffect, useRef } from "react";
import type { Route } from "./+types/dashboard";
import { requireUserId } from "./server/session.server";
import { getUserById } from "./model/user.server";
import {
  recordConversion,
  getConversion,
  getConversions,
  getAllConversions,
  getTopUsersByConversion,
} from "./model/conversion.server";
import {
  getMaterialUsageStats,
  getTodayUsageCount,
  getAllMaterialUsageStats,
  getMaterialStatusStats,
  getTopUsersByUsage,
} from "./model/material.server";
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
} from "recharts";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  const today = new Date().toISOString().split("T")[0];
  const todayConversion = await getConversion(Number(userId), today);
  const todayUsageCount = await getTodayUsageCount(user.name);

  // Calculate date range for last 7 days
  const endDate = today;
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - 6);
  const startDate = startDateObj.toISOString().split("T")[0];

  const conversions = await getConversions(Number(userId), startDate, endDate);
  const usageStats = await getMaterialUsageStats(user.name, startDate, endDate);

  // Merge data
  const chartData = [];
  for (
    let d = new Date(startDateObj);
    d <= new Date(today);
    d.setDate(d.getDate() + 1)
  ) {
    const dateStr = d.toISOString().split("T")[0];
    const conv = conversions.find((c) => c.date === dateStr)?.count || 0;
    const usage = usageStats.find((u) => u.date === dateStr)?.count || 0;
    const rate = usage > 0 ? parseFloat((conv / usage).toFixed(2)) : 0;

    chartData.push({
      date: dateStr,
      conversion: conv,
      usage: usage,
      rate: rate,
    });
  }

  let adminData = null;
  if (user.role === "admin") {
    const allUsage = await getAllMaterialUsageStats(startDate, endDate);
    const allConversions = await getAllConversions(startDate, endDate);
    const statusStats = await getMaterialStatusStats();
    const topUsersUsage = await getTopUsersByUsage(startDate, endDate);
    const topUsersConversion = await getTopUsersByConversion(
      startDate,
      endDate
    );

    const adminChartData = [];
    for (
      let d = new Date(startDateObj);
      d <= new Date(today);
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split("T")[0];
      const conv = allConversions.find((c) => c.date === dateStr)?.count || 0;
      const usage = allUsage.find((u) => u.date === dateStr)?.count || 0;
      const rate = usage > 0 ? parseFloat((conv / usage).toFixed(2)) : 0;

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
      topUsersUsage,
      topUsersConversion,
    };
  }

  return {
    user,
    todayConversion,
    today,
    todayUsageCount,
    chartData,
    adminData,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "record_conversion") {
    const count = parseInt(formData.get("count") as string);
    const date = new Date().toISOString().split("T")[0]; // Always record for today

    if (isNaN(count) || count < 0) {
      return { error: "请输入有效的数量" };
    }

    await recordConversion(Number(userId), date, count);
    return { success: true, message: "登记成功" };
  }
  return null;
}

export default function Dashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    user,
    todayConversion,
    today,
    todayUsageCount,
    chartData,
    adminData,
  } = loaderData;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (actionData?.success) {
      setIsModalOpen(false);
      formRef.current?.reset();
    }
  }, [actionData]);

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

  if (user.role === "admin" && adminData) {
    return (
      <div className="p-4 container mx-auto text-gray-800 dark:text-white">
        <h1 className="text-2xl font-bold mb-6">管理工作台</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Global Trend */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
              全平台近7日趋势
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminData.chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#374151"
                    opacity={0.1}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#6B7280"
                    fontSize={12}
                    tickFormatter={(val) => val.slice(5)}
                  />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1F2937",
                      borderColor: "#374151",
                      color: "#F3F4F6",
                    }}
                    itemStyle={{ color: "#F3F4F6" }}
                  />
                  <Legend />
                  <Bar
                    dataKey="conversion"
                    name="总转化数"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="usage"
                    name="总账号使用"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Material Status Distribution */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
              账号状态分布
            </h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={adminData.statusStats}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="status"
                  >
                    {adminData.statusStats.map((entry: any, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1F2937",
                      borderColor: "#374151",
                      color: "#F3F4F6",
                    }}
                    itemStyle={{ color: "#F3F4F6" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Users by Conversion */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
              转化榜 Top 5 (近7日)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={adminData.topUsersConversion}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#374151"
                    opacity={0.1}
                  />
                  <XAxis type="number" stroke="#6B7280" fontSize={12} />
                  <YAxis
                    dataKey="user"
                    type="category"
                    stroke="#6B7280"
                    fontSize={12}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1F2937",
                      borderColor: "#374151",
                      color: "#F3F4F6",
                    }}
                    itemStyle={{ color: "#F3F4F6" }}
                  />
                  <Bar
                    dataKey="count"
                    name="转化数"
                    fill="#8B5CF6"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Users by Usage */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
              勤奋榜 Top 5 (近7日)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={adminData.topUsersUsage}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#374151"
                    opacity={0.1}
                  />
                  <XAxis type="number" stroke="#6B7280" fontSize={12} />
                  <YAxis
                    dataKey="user"
                    type="category"
                    stroke="#6B7280"
                    fontSize={12}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1F2937",
                      borderColor: "#374151",
                      color: "#F3F4F6",
                    }}
                    itemStyle={{ color: "#F3F4F6" }}
                  />
                  <Bar
                    dataKey="count"
                    name="账号使用数"
                    fill="#F59E0B"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 container mx-auto text-gray-800 dark:text-white">
      <h1 className="text-2xl font-bold mb-6">工作台</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Conversion Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
            今日转化
          </h2>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-4">
            {todayConversion?.count || 0}
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            转化登记
          </button>
        </div>

        {/* Today Usage Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
            今日账号使用
          </h2>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-4">
            {todayUsageCount}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            今日转化率:{" "}
            {todayUsageCount > 0
              ? (
                  ((todayConversion?.count || 0) / todayUsageCount) *
                  100
                ).toFixed(1)
              : 0}
            %
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            近7日转化趋势
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#374151"
                  opacity={0.1}
                />
                <XAxis
                  dataKey="date"
                  stroke="#6B7280"
                  fontSize={12}
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F2937",
                    borderColor: "#374151",
                    color: "#F3F4F6",
                  }}
                  itemStyle={{ color: "#F3F4F6" }}
                />
                <Legend />
                <Bar
                  dataKey="conversion"
                  name="转化数"
                  fill="#3B82F6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="usage"
                  name="账号使用数"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Rate Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">
            近7日转化率趋势
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#374151"
                  opacity={0.1}
                />
                <XAxis
                  dataKey="date"
                  stroke="#6B7280"
                  fontSize={12}
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F2937",
                    borderColor: "#374151",
                    color: "#F3F4F6",
                  }}
                  itemStyle={{ color: "#F3F4F6" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="转化率"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
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
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setIsModalOpen(false)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:align-middle">
              <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4">
                  登记今日转化 ({today})
                </h3>
                <Form method="post" ref={formRef}>
                  <input
                    type="hidden"
                    name="intent"
                    value="record_conversion"
                  />
                  <div className="mb-4">
                    <label
                      htmlFor="count"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
                      className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  {actionData?.error && (
                    <div className="mb-4 text-sm text-red-600 dark:text-red-400">
                      {actionData.error}
                    </div>
                  )}
                  <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex w-full justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-2 sm:text-sm disabled:opacity-50"
                    >
                      {isSubmitting ? "保存中..." : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:col-start-1 sm:mt-0 sm:text-sm"
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
