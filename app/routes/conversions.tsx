import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { requireUserId } from "./server/session.server";
import { getConversions, getAllUserConversions } from "./model/conversion.server";
import { getUserById } from "./model/user.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  let conversions;
  if (user.role === "admin") {
    conversions = await getAllUserConversions();
  } else {
    conversions = await getConversions(Number(userId));
  }
  
  return { conversions, user };
}

export default function Conversions() {
  const { conversions, user } = useLoaderData<typeof loader>();
  const isAdmin = user.role === "admin";

  return (
    <div className="p-8 container mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
          <ClipboardDocumentListIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">转化记录</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">查看历史转化数据统计</p>
        </div>
      </div>
      
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  转化数量
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
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {conversion.count}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(conversion.updated_at).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 4 : 3} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
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
    </div>
  );
}
