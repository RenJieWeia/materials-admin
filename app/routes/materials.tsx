import { Form, useNavigation, useSubmit, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { ArrowDownTrayIcon, DocumentArrowUpIcon, MagnifyingGlassIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/materials";
import { requireUserId } from "../core/session.server";
import { getUserById, getAllUsers } from "../services/user.server";
import {
  getMaterials,
  createMaterial,
  claimMaterial,
  getUniqueGameNames,
  getMaterialByAccountName,
} from "../services/material.server";
import { createAuditLog } from "../services/audit.server";
import Pagination from "../components/Pagination";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");

  const url = new URL(request.url);
  const game_name = url.searchParams.get("game_name") || undefined;
  const account_name = url.searchParams.get("account_name") || undefined;
  
  const statusParam = url.searchParams.get("status");
  const status = statusParam === null ? "空闲" : (statusParam || undefined);

  const filterUser = url.searchParams.get("user") || undefined;
  const filterUserRealName = url.searchParams.get("user_real_name") || undefined;
  const startDate = url.searchParams.get("startDate") || undefined;
  const endDate = url.searchParams.get("endDate") || undefined;
  const sort = url.searchParams.get("sort") || "created_at";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");

  const [gameNames, allUsers] = await Promise.all([
    getUniqueGameNames(status),
    getAllUsers(),
  ]);

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
    gameNames,
    allUsers,
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
      createAuditLog({
        user_id: user.id,
        user_name: user.name,
        action: "领取材料",
        entity: "材料",
        entity_id: id.toString(),
        details: `领取材料: ${material.account_name}`,
      }, request);
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

    const userId = await requireUserId(request);
    const currentUser = await getUserById(userId);
    if (!currentUser) return { error: "User not found" };

    const allUsers = await getAllUsers();
    const validUsernames = new Set(allUsers.map((u) => u.name));

    let count = 0;
    let skipped = 0;
    const skippedAccounts: string[] = [];
    let invalidStatusCount = 0;
    const invalidStatusAccounts: string[] = [];
    let invalidUserCount = 0;
    const invalidUserAccounts: string[] = [];

    for (const row of data) {
      // 假设 Excel 列名为：游戏名称, 账户名称
      if (row["游戏名称"] && row["账户名称"]) {
        const existing = await getMaterialByAccountName(row["账户名称"]);
        if (existing) {
          skipped++;
          skippedAccounts.push(row["账户名称"]);
          continue;
        }

        let status = row["使用状态"] || row["状态"] || "空闲";
        if (status !== "空闲" && status !== "已使用") {
          invalidStatusCount++;
          invalidStatusAccounts.push(row["账户名称"]);
          continue;
        }

        let user = row["使用人"];
        let usage_time = row["使用时间"];

        if (status === "空闲") {
          user = null;
          usage_time = null;
        } else if (status === "已使用") {
          if (!validUsernames.has(user)) {
            invalidUserCount++;
            invalidUserAccounts.push(row["账户名称"]);
            continue;
          }

          if (!usage_time) {
            const date = new Date();
            usage_time =
              date.getFullYear() +
              "-" +
              String(date.getMonth() + 1).padStart(2, "0") +
              "-" +
              String(date.getDate()).padStart(2, "0") +
              " " +
              String(date.getHours()).padStart(2, "0") +
              ":" +
              String(date.getMinutes()).padStart(2, "0") +
              ":" +
              String(date.getSeconds()).padStart(2, "0");
          }
        }

        await createMaterial({
          game_name: row["游戏名称"],
          account_name: row["账户名称"],
          description: row["描述"],
          status: status,
          user: user,
          usage_time: usage_time,
        });
        count++;
      }
    }

    let message = `成功导入 ${count} 条数据`;
    if (skipped > 0) {
      message += `，跳过 ${skipped} 条重复数据`;
      if (skippedAccounts.length > 0) {
         const displayedAccounts = skippedAccounts.slice(0, 3).join(", ");
         message += ` (重复账号: ${displayedAccounts}${skippedAccounts.length > 3 ? ' 等' : ''})`;
      }
    }
    if (invalidStatusCount > 0) {
      message += `，跳过 ${invalidStatusCount} 条状态异常数据`;
      if (invalidStatusAccounts.length > 0) {
        const displayedAccounts = invalidStatusAccounts.slice(0, 3).join(", ");
        message += ` (异常账号: ${displayedAccounts}${invalidStatusAccounts.length > 3 ? ' 等' : ''})`;
      }
    }
    if (invalidUserCount > 0) {
      message += `，跳过 ${invalidUserCount} 条使用人异常数据`;
      if (invalidUserAccounts.length > 0) {
        const displayedAccounts = invalidUserAccounts.slice(0, 3).join(", ");
        message += ` (异常账号: ${displayedAccounts}${invalidUserAccounts.length > 3 ? ' 等' : ''})`;
      }
    }

    // 统计各游戏导入数量
    const gameStats: Record<string, number> = {};
    let idleCount = 0;
    
    for (const row of data) {
      if (row["游戏名称"] && row["账户名称"]) {
        const gameName = row["游戏名称"];
        gameStats[gameName] = (gameStats[gameName] || 0) + 1;
        
        const status = row["使用状态"] || row["状态"] || "空闲";
        if (status === "空闲") {
          idleCount++;
        }
      }
    }

    const gameDetails = Object.entries(gameStats)
      .map(([game, count]) => `${game}: ${count}条`)
      .join(", ");

    createAuditLog({
      user_id: currentUser.id,
      user_name: currentUser.name,
      action: "导入材料",
      entity: "材料",
      details: `成功导入 ${count} 条数据 (空闲: ${idleCount}条)。明细: ${gameDetails}`,
    }, request);

    return { success: true, message };
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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboard = (text: string, isClaim: boolean = false) => {
    const copyFallback = (text: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      
      // Ensure it's not visible but part of the DOM
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
           showToast("success", `账号 ${text} 已复制到剪贴板`);
        } else {
           showToast("success", isClaim ? `领取成功！账号: ${text}` : `账号: ${text}`);
        }
      } catch (err) {
        console.error('Fallback copy failed', err);
        showToast("success", isClaim ? `领取成功！账号: ${text}` : `账号: ${text}`);
      }
      
      document.body.removeChild(textArea);
    };

    // Check if clipboard API is available (requires secure context like HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("success", `账号 ${text} 已复制到剪贴板`);
      }).catch((err) => {
        console.error("Clipboard write failed", err);
        copyFallback(text);
      });
    } else {
      // Fallback for non-secure contexts
      copyFallback(text);
    }
  };

  useEffect(() => {
    if (actionData?.success && formRef.current) {
      formRef.current.reset();
    }
  }, [actionData]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.claimedAccount) {
      copyToClipboard(fetcher.data.claimedAccount, true);
    } else if (fetcher.data?.error) {
      showToast("error", fetcher.data.error);
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
    fetcher.submit({ intent: "claim", id: id.toString() }, { method: "post" });
  };

  return (
    <div className="p-8 container mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">物资管理</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理游戏账号与物资分配</p>
        </div>
        <div className="flex gap-3">
          <a
            href="/resources/material-template"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4 mr-2 text-slate-500" />
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
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            <DocumentArrowUpIcon className="w-4 h-4 mr-2" />
            {isSubmitting ? "处理中..." : "Excel 导入"}
          </button>
        </div>
      </div>

      {/* Search Filters */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
        <Form method="get" className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label
              htmlFor="game_name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              游戏名称
            </label>
            <div className="relative">
              <select
                name="game_name"
                defaultValue={filters.game_name || ""}
                className="w-full appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
              >
                <option value="">全部</option>
                {loaderData.gameNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
              </div>
            </div>
          </div>
          <div>
            <label
              htmlFor="account_name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              账户名称
            </label>
            <input
              type="text"
              name="account_name"
              defaultValue={filters.account_name}
              placeholder="搜索账户..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
          </div>
          <div>
            <label
              htmlFor="user"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              使用人
            </label>
            <div className="relative">
              <select
                name="user"
                defaultValue={filters.user || ""}
                className="w-full appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
              >
                <option value="">全部</option>
                <optgroup label="管理员">
                  {loaderData.allUsers
                    .filter((u) => u.role === "admin")
                    .map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.real_name ? `${u.real_name} (${u.name})` : u.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="员工">
                  {loaderData.allUsers
                    .filter((u) => u.role !== "admin")
                    .map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.real_name ? `${u.real_name} (${u.name})` : u.name}
                      </option>
                    ))}
                </optgroup>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
              </div>
            </div>
          </div>
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              开始时间
            </label>
            <input
              type="date"
              name="startDate"
              defaultValue={filters.startDate}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
          </div>
          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              结束时间
            </label>
            <input
              type="date"
              name="endDate"
              defaultValue={filters.endDate}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
          </div>
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              状态
            </label>
            <div className="relative">
              <select
                name="status"
                defaultValue={filters.status || ""}
                onChange={(e) => submit(e.currentTarget.form)}
                className="w-full appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
              >
                <option value="">全部</option>
                <option value="空闲">空闲</option>
                <option value="已使用">已使用</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
              </div>
            </div>
          </div>
          <div>
            <label
              htmlFor="sort"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              排序
            </label>
            <div className="relative">
              <select
                name="sort"
                defaultValue={filters.sort || "created_at"}
                className="w-full appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
              >
                <option value="created_at">创建时间 (默认)</option>
                <option value="usage_time">使用时间</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path></svg>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="flex-1 inline-flex justify-center items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
            >
              <MagnifyingGlassIcon className="w-4 h-4 mr-2" />
              查询
            </button>
            <a
              href="/materials"
              className="flex-1 inline-flex justify-center items-center rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              重置
            </a>
          </div>
        </Form>
      </div>

      {actionData?.message && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-700 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-800">
          {actionData.message}
        </div>
      )}

      {actionData?.error && (
        <div className="rounded-md bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-200 border border-rose-100 dark:border-rose-800">
          {actionData.error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  游戏名称
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  账户名称
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  使用状态
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  使用人
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  使用人姓名
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  使用时间
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {materials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <DocumentArrowUpIcon className="w-12 h-12 text-slate-300 mb-3" />
                      <p>暂无数据</p>
                    </div>
                  </td>
                </tr>
              ) : (
                materials.map((material) => (
                  <tr key={material.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                      {material.game_name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {material.status === "空闲" ? (
                        <button
                          onClick={() => handleClaim(material.id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-medium"
                          title="点击领取并复制账号"
                        >
                          {material.account_name}
                        </button>
                      ) : (
                        <button
                          onClick={() => copyToClipboard(material.account_name)}
                          className="text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer font-medium"
                          title="点击复制账号"
                        >
                          {material.account_name}
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          material.status === "已使用"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {material.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {material.user || "-"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                      {material.user_real_name || "-"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
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
      <div className="mt-6">
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

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-6 py-3 text-white shadow-xl transition-all duration-300 transform translate-y-0 ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
