import { useState, useMemo } from "react";
import { useLoaderData, useSearchParams, Form, useSubmit } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { 
  ClipboardDocumentListIcon, 
  FunnelIcon, 
  ChartBarIcon, 
  TableCellsIcon,
  PresentationChartLineIcon
} from "@heroicons/react/24/outline";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { requireUserId } from "../core/session.server";
import { getConversions, getAllUserConversions } from "../services/conversion.server";
import { getUserById, getAllUsers } from "../services/user.server";
import { getMaterialUsageStats, getAllUserDailyUsageStats } from "../services/material.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  const url = new URL(request.url);
  let startDate = url.searchParams.get("startDate");
  let endDate = url.searchParams.get("endDate");
  const filterUserId = url.searchParams.get("userId") ? Number(url.searchParams.get("userId")) : undefined;

  // Default to today if no date range is provided
  if (!startDate && !endDate) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    startDate = todayStr;
    endDate = todayStr;
  }

  let conversions;
  let allUsers: any[] = [];
  let usageStats: any[] = [];

  if (user.role === "admin") {
    conversions = await getAllUserConversions(startDate || undefined, endDate || undefined, filterUserId);
    allUsers = await getAllUsers();
    usageStats = await getAllUserDailyUsageStats(startDate || undefined, endDate || undefined);
  } else {
    conversions = await getConversions(Number(userId), startDate || undefined, endDate || undefined);
    usageStats = await getMaterialUsageStats(user.name, startDate || undefined, endDate || undefined);
  }
  
  return { conversions, user, allUsers, usageStats, startDate, endDate };
}

export default function Conversions() {
  const { conversions, user, allUsers, usageStats, startDate, endDate } = useLoaderData<typeof loader>();
  const isAdmin = user.role === "admin";
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [metricType, setMetricType] = useState<'count' | 'pass_count' | 'usage_count'>('count');

  const isAllUsers = isAdmin && !searchParams.get("userId");

  // Prepare data for chart
  const { chartData, userNames } = useMemo(() => {
    if (isAllUsers) {
      // Group by date
      const grouped = conversions.reduce((acc: any, curr: any) => {
        const date = curr.date;
        if (!acc[date]) {
          acc[date] = { date };
        }
        const userName = curr.real_name || curr.user_name || 'Unknown';
        
        let value = 0;
        if (metricType === 'count') value = curr.count;
        else if (metricType === 'pass_count') value = curr.pass_count || 0;
        else if (metricType === 'usage_count') value = curr.usage_count || 0;
        
        acc[date][userName] = value;
        return acc;
      }, {});
      
      // Get all unique user names for lines/bars
      const names = Array.from(new Set(conversions.map((c: any) => c.real_name || c.user_name || 'Unknown')));
      
      const data = Object.values(grouped).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return { chartData: data, userNames: names as string[] };
    } else {
      const data = conversions.map((c: any) => {
        const usage = c.usage_count || 0;
        const count = c.count || 0;
        const pass = c.pass_count || 0;
        return {
          ...c,
          conversion_rate: pass > 0 ? Number(((count / pass) * 100).toFixed(2)) : 0,
          pass_rate: usage > 0 ? Number(((pass / usage) * 100).toFixed(2)) : 0,
        };
      }).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return { chartData: data, userNames: [] };
    }
  }, [conversions, isAllUsers, metricType]);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div className="p-8 container mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
            <ClipboardDocumentListIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">转化记录</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">查看历史转化数据统计</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
          <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'table' 
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
              title="表格视图"
            >
              <TableCellsIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'chart' 
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' 
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
              title="图表视图"
            >
              <ChartBarIcon className="w-5 h-5" />
            </button>
          </div>

          <Form 
            method="get" 
            className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
            onChange={(e) => submit(e.currentTarget)}
          >
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">筛选:</span>
            </div>
            
            <input
              type="date"
              name="startDate"
              defaultValue={startDate || ""}
              className="px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              name="endDate"
              defaultValue={endDate || ""}
              className="px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />

            {isAdmin && (
              <select
                name="userId"
                defaultValue={searchParams.get("userId") || ""}
                className="px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-transparent dark:bg-slate-800 text-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="" className="dark:bg-slate-800">所有员工</option>
                {allUsers.map((u: any) => (
                  <option key={u.id} value={u.id} className="dark:bg-slate-800">
                    {u.real_name || u.name}
                  </option>
                ))}
              </select>
            )}
          </Form>
        </div>
      </div>
      
      {viewMode === 'chart' ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              转化趋势图表
            </h2>
            <div className="flex gap-3">
              {isAllUsers && (
                <div className="flex bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1">
                  <button
                    onClick={() => setMetricType('count')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      metricType === 'count' 
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    转化数
                  </button>
                  <button
                    onClick={() => setMetricType('pass_count')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      metricType === 'pass_count' 
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    通过数
                  </button>
                  <button
                    onClick={() => setMetricType('usage_count')}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      metricType === 'usage_count' 
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    使用数
                  </button>
                </div>
              )}
              <div className="flex bg-slate-100 dark:bg-slate-700/50 rounded-lg p-1">
                <button
                  onClick={() => setChartType('bar')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    chartType === 'bar' 
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <ChartBarIcon className="w-4 h-4" />
                  柱状图
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    chartType === 'line' 
                      ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <PresentationChartLineIcon className="w-4 h-4" />
                  曲线图
                </button>
              </div>
            </div>
          </div>
          
          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {!isAllUsers ? (
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickFormatter={(val) => val.slice(5)} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10} 
                  />
                  <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={10} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      color: "#f8fafc",
                      borderRadius: "0.375rem",
                      border: "1px solid #334155"
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Bar yAxisId="left" dataKey="count" name="转化数量" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar yAxisId="left" dataKey="pass_count" name="通过数量" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line yAxisId="right" type="monotone" dataKey="conversion_rate" name="转化率" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line yAxisId="right" type="monotone" dataKey="pass_rate" name="通过率" stroke="#ec4899" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              ) : chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickFormatter={(val) => val.slice(5)} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10} 
                  />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      color: "#f8fafc",
                      borderRadius: "0.375rem",
                      border: "1px solid #334155"
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                    cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {userNames.map((name, index) => (
                    <Bar 
                      key={name} 
                      dataKey={name} 
                      name={name} 
                      stackId="a"
                      fill={colors[index % colors.length]} 
                      radius={[0, 0, 0, 0]} 
                    />
                  ))}
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#94a3b8" 
                    fontSize={12} 
                    tickFormatter={(val) => val.slice(5)} 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10} 
                  />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} dx={-10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      borderColor: "#334155",
                      color: "#f8fafc",
                      borderRadius: "0.375rem",
                      border: "1px solid #334155"
                    }}
                    itemStyle={{ color: "#f8fafc" }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  {userNames.map((name, index) => (
                    <Line 
                      key={name} 
                      type="monotone" 
                      dataKey={name} 
                      name={name} 
                      stroke={colors[index % colors.length]} 
                      strokeWidth={3} 
                      dot={{ r: 4 }} 
                      activeDot={{ r: 6 }} 
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    日期
                  </th>
                  {isAdmin && (
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      用户
                    </th>
                  )}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">                    使用数量
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">                    转化数量
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    通过数量
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    转化率
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    通过率
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    记录时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                {conversions.length > 0 ? (
                  conversions.map((conversion) => (
                    <tr key={conversion.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                        {conversion.date}
                      </td>
                      {isAdmin && (
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {(conversion as any).real_name || (conversion as any).user_name || "-"}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          {conversion.usage_count || 0}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          {conversion.count}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          {conversion.pass_count || 0}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {(conversion.pass_count || 0) > 0
                          ? ((conversion.count / (conversion.pass_count || 0)) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {(conversion.usage_count || 0) > 0
                          ? (((conversion.pass_count || 0) / (conversion.usage_count || 0)) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                        {new Date(conversion.updated_at.replace(" ", "T") + "Z").toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col items-center justify-center">
                        <ClipboardDocumentListIcon className="w-12 h-12 text-slate-300 mb-3" />
                        <p>暂无转化记录</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
