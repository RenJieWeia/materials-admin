import { Form, useNavigation, useSubmit, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import type { Route } from "./+types/materials";
import { requireUserId } from "./server/session.server";
import { getUserById } from "./model/user.server";
import {
  getMaterials,
  createMaterial,
  claimMaterial,
} from "./model/material.server";
import Pagination from "../components/Pagination";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");

  const url = new URL(request.url);
  const game_name = url.searchParams.get("game_name") || undefined;
  const account_name = url.searchParams.get("account_name") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const filterUser = url.searchParams.get("user") || undefined;
  const filterUserRealName = url.searchParams.get("user_real_name") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;
  const sort = url.searchParams.get("sort") || "created_at";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");

  const data = await getMaterials({
    game_name,
    account_name,
    status,
    user: filterUser,
    user_real_name: filterUserRealName,
    startDate,
    endDate,
    viewer: { username: user.name, role: user.role },
    page,
    limit,
    sort,
  });
  return {
    ...data,
    filters: {
      game_name,
      account_name,
      status,
      user: filterUser,
      user_real_name: filterUserRealName,
      startDate,
      endDate,
      sort,
    },
    user: { id: user.id, name: user.name, role: user.role },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "claim") {
    const id = formData.get("id");
    const userId = await requireUserId(request);
    const user = await getUserById(userId);
    if (!user) return { error: "User not found" };

    try {
      const material = await claimMaterial(Number(id), user.name);
      return { success: true, claimedAccount: material.account_name };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  if (intent === "import") {
    const file = formData.get("file") as File;
    if (!file || file.size === 0) {
      return { error: "请选择文件" };
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet) as any[];

    let count = 0;
    for (const row of data) {
      // 假设 Excel 列名为：游戏名称, 账户名称
      if (row["游戏名称"] && row["账户名称"]) {
        await createMaterial({
          game_name: row["游戏名称"],
          account_name: row["账户名称"],
          description: row["描述"],
          status: row["状态"] || "空闲",
          user: row["使用人"],
          usage_time: row["使用时间"],
        });
        count++;
      }
    }

    return { success: true, message: `成功导入 ${count} 条数据` };
  }

  return null;
}

export default function Materials({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { materials, total, page, limit, totalPages, filters, user } =
    loaderData;
  const navigation = useNavigation();
  const submit = useSubmit();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (actionData?.success && formRef.current) {
      formRef.current.reset();
    }
  }, [actionData]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.claimedAccount) {
      const account = fetcher.data.claimedAccount;
      // Check if clipboard API is available (requires secure context like HTTPS or localhost)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(account).then(() => {
          alert(`账号 ${account} 已复制到剪贴板`);
        }).catch((err) => {
          console.error("Clipboard write failed", err);
          alert(`领取成功！账号: ${account}`);
        });
      } else {
        // Fallback for non-secure contexts
        alert(`领取成功！账号: ${account}`);
      }
    } else if (fetcher.data?.error) {
      alert(fetcher.data.error);
    }
  }, [fetcher.data]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (
        !confirm(
          "确定要导入该 Excel 文件吗？请确保列名为：游戏名称, 账户名称, 描述, 状态, 使用人, 使用时间"
        )
      ) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const formData = new FormData();
      formData.append("intent", "import");
      formData.append("file", file);
      submit(formData, { method: "post", encType: "multipart/form-data" });
    }
  };

  const handleClaim = (id: number) => {
    if (confirm("确定要领取该账号吗？")) {
      fetcher.submit({ intent: "claim", id: id.toString() }, { method: "post" });
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">物资管理</h1>
        <div className="flex gap-2">
          <a
            href="/resources/material-template"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            下载模板
          </a>
          <input
            type="file"
            accept=".xlsx, .xls"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? "处理中..." : "Excel 导入"}
          </button>
        </div>
      </div>

      {/* Search Filters */}
      <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm transition-colors duration-200">
        <Form method="get" className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="game_name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              游戏名称
            </label>
            <input
              type="text"
              name="game_name"
              defaultValue={filters.game_name}
              placeholder="搜索游戏..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="account_name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              账户名称
            </label>
            <input
              type="text"
              name="account_name"
              defaultValue={filters.account_name}
              placeholder="搜索账户..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="user"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              使用人
            </label>
            <input
              type="text"
              name="user"
              defaultValue={filters.user}
              placeholder="搜索使用人..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="user_real_name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              使用人姓名
            </label>
            <input
              type="text"
              name="user_real_name"
              defaultValue={filters.user_real_name}
              placeholder="搜索使用人姓名..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              开始时间
            </label>
            <input
              type="date"
              name="startDate"
              defaultValue={filters.startDate}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              结束时间
            </label>
            <input
              type="date"
              name="endDate"
              defaultValue={filters.endDate}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="status"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              状态
            </label>
            <select
              name="status"
              defaultValue={filters.status || ""}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="空闲">空闲</option>
              <option value="已使用">已使用</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="sort"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              排序
            </label>
            <select
              name="sort"
              defaultValue={filters.sort || "created_at"}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="created_at">创建时间 (默认)</option>
              <option value="usage_time">使用时间</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              查询
            </button>
            <a
              href="/materials"
              className="ml-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              重置
            </a>
          </div>
        </Form>
      </div>

      {actionData?.message && (
        <div className="mb-4 rounded-md bg-green-50 dark:bg-green-900 p-4 text-sm text-green-700 dark:text-green-200">
          {actionData.message}
        </div>
      )}

      {actionData?.error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900 p-4 text-sm text-red-700 dark:text-red-200">
          {actionData.error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm transition-colors duration-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  游戏名称
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  账户名称
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  使用状态
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  使用人
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  使用人姓名
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  使用时间
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {materials.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    暂无数据
                  </td>
                </tr>
              ) : (
                materials.map((material) => (
                  <tr key={material.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                      {material.game_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {material.account_name.includes("****") ? (
                        <button
                          onClick={() => handleClaim(material.id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                          title="点击领取并复制账号"
                        >
                          {material.account_name}
                        </button>
                      ) : (
                        material.account_name
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          material.status === "已使用"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {material.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {material.user || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {material.user_real_name || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                      {material.usage_time || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Pagination
        total={total}
        page={page}
        limit={limit}
        onPageChange={(p) => {
          setSearchParams((prev) => {
            prev.set("page", p.toString());
            return prev;
          });
        }}
        onLimitChange={(l) => {
          setSearchParams((prev) => {
            prev.set("limit", l.toString());
            prev.set("page", "1"); // Reset to first page when limit changes
            return prev;
          });
        }}
      />
    </div>
  );
}
