import { Form, useNavigation, redirect, useSearchParams } from "react-router";
import { useState, useEffect, useRef } from "react";
import { UserPlusIcon, MagnifyingGlassIcon, ArrowPathIcon, PencilSquareIcon, KeyIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { Route } from "./+types/users";
import { getUsers, createUser, updateUserPassword, getUserById, deleteUser, updateUserProfile } from "../services/user.server";
import { requireUserId } from "../core/session.server";
import { createAuditLog } from "../services/audit.server";
import Pagination from "../components/Pagination";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);

  if (user?.role !== "admin") {
    throw new Response("无权限访问", { status: 403 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name") || undefined;
  const email = url.searchParams.get("email") || undefined;
  const role = url.searchParams.get("role") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");

  const data = await getUsers({ name, email, role, page, limit });
  return { ...data, filters: { name, email, role } };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);

  if (user?.role !== "admin") {
    return { error: "无权限执行此操作" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const deleteUserId = formData.get("userId") as string;
    if (!deleteUserId) return { error: "User ID is required" };
    
    // Prevent deleting yourself
    if (deleteUserId === userId) {
      return { error: "不能删除自己" };
    }

    const result = await deleteUser(deleteUserId);
    if (!result.success) {
      return { error: result.message };
    }
    createAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "删除用户",
      entity: "用户",
      entity_id: deleteUserId,
      details: `删除用户 ID: ${deleteUserId}`,
    }, request);
    return { success: true };
  }

  if (intent === "create") {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as string;
    const real_name = formData.get("real_name") as string;

    if (!name || !email || !password || !role) {
      return { error: "所有字段都是必填的" };
    }

    const result = await createUser(email, password, name, role, real_name);
    if (!result.success) {
      return { error: result.message };
    }
    createAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "创建用户",
      entity: "用户",
      details: `创建用户: ${name} (${email})`,
    }, request);
    return { success: true };
  }

  if (intent === "updateProfile") {
    const userId = formData.get("userId") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const real_name = formData.get("real_name") as string;

    if (!userId) {
      return { error: "User ID is required" };
    }

    const result = await updateUserProfile(userId, { name, email, real_name });
    if (!result.success) {
      return { error: result.message };
    }
    createAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "更新用户资料",
      entity: "用户",
      entity_id: userId,
      details: `更新用户资料 ID: ${userId}`,
    }, request);
    return { success: true };
  }

  if (intent === "updatePassword") {
    const userId = formData.get("userId") as string;
    const password = formData.get("password") as string;

    if (!userId || !password) {
      return { error: "密码不能为空" };
    }

    const result = await updateUserPassword(userId, password);
    if (!result.success) {
      return { error: result.message };
    }
    createAuditLog({
      user_id: user.id,
      user_name: user.name,
      action: "修改用户密码",
      entity: "用户",
      entity_id: userId,
      details: `修改用户密码 ID: ${userId}`,
    }, request);
    return { success: true };
  }

  return null;
}

export default function Users({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { users, total, page, limit, totalPages, filters } = loaderData;
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editModalUser, setEditModalUser] = useState<{
    id: number;
    name: string;
    email: string;
    real_name?: string;
  } | null>(null);
  const [passwordModalUser, setPasswordModalUser] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const passwordFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (actionData?.success) {
      setIsAddModalOpen(false);
      setEditModalUser(null);
      setPasswordModalUser(null);
      formRef.current?.reset();
      editFormRef.current?.reset();
      passwordFormRef.current?.reset();
    }
  }, [actionData]);

  return (
    <div className="p-8 container mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">账户管理</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理系统用户与权限</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          <UserPlusIcon className="w-4 h-4 mr-2" />
          添加用户
        </button>
      </div>

      {/* Search Filters */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
        <Form method="get" className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              用户名
            </label>
            <input
              type="text"
              name="name"
              defaultValue={filters.name}
              placeholder="搜索用户名..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              邮箱
            </label>
            <input
              type="text"
              name="email"
              defaultValue={filters.email}
              placeholder="搜索邮箱..."
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
            />
          </div>
          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              角色
            </label>
            <div className="relative">
              <select
                name="role"
                defaultValue={filters.role || ""}
                className="w-full appearance-none rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
              >
                <option value="">全部</option>
                <option value="admin">管理员</option>
                <option value="user">员工</option>
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
              href="/users"
              className="flex-1 inline-flex justify-center items-center rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors shadow-sm"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              重置
            </a>
          </div>
        </Form>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  用户名
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  姓名
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  邮箱
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  角色
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  创建时间
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                    {user.id}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">
                    {user.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                    {user.real_name || "-"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                    {user.email}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      }`}
                    >
                      {user.role === "admin" ? "管理员" : "员工"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                    {new Date(user.created_at).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => setEditModalUser(user)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        title="编辑"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setPasswordModalUser(user)}
                        className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                        title="修改密码"
                      >
                        <KeyIcon className="w-4 h-4" />
                      </button>
                      <Form
                        method="post"
                        className="inline-block"
                        onSubmit={(e) => {
                          if (!confirm("确定要删除该用户吗？")) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="userId" value={user.id} />
                        <button
                          type="submit"
                          className="text-rose-600 hover:text-rose-900 dark:text-rose-400 dark:hover:text-rose-300 transition-colors"
                          title="删除"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity"
                onClick={() => setIsAddModalOpen(false)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-xl bg-white dark:bg-slate-800 text-left align-bottom shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle border border-slate-200 dark:border-slate-700">
              <div className="bg-white dark:bg-slate-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-bold leading-6 text-slate-900 dark:text-white mb-4">
                  添加用户
                </h3>
                <Form method="post" ref={formRef} className="space-y-4">
                  <input type="hidden" name="intent" value="create" />
                  {actionData?.error && !passwordModalUser && (
                    <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-600 dark:text-rose-400">
                      {actionData.error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      用户名
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      姓名
                    </label>
                    <input
                      type="text"
                      name="real_name"
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      邮箱
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      密码
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      角色
                    </label>
                    <select
                      name="role"
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    >
                      <option value="user">员工</option>
                      <option value="admin">管理员</option>
                    </select>
                  </div>
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
                      onClick={() => setIsAddModalOpen(false)}
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

      {/* Edit User Modal */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity"
                onClick={() => setEditModalUser(null)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-xl bg-white dark:bg-slate-800 text-left align-bottom shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle border border-slate-200 dark:border-slate-700">
              <div className="bg-white dark:bg-slate-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-bold leading-6 text-slate-900 dark:text-white mb-4">
                  编辑用户
                </h3>
                <Form
                  method="post"
                  ref={editFormRef}
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="updateProfile" />
                  <input type="hidden" name="userId" value={editModalUser.id} />
                  {actionData?.error && editModalUser && (
                    <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-600 dark:text-rose-400">
                      {actionData.error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      用户名
                    </label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={editModalUser.name}
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      姓名
                    </label>
                    <input
                      type="text"
                      name="real_name"
                      defaultValue={editModalUser.real_name || ""}
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      邮箱
                    </label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={editModalUser.email}
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
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
                      onClick={() => setEditModalUser(null)}
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

      {/* Change Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-slate-900/75 backdrop-blur-sm transition-opacity"
                onClick={() => setPasswordModalUser(null)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-xl bg-white dark:bg-slate-800 text-left align-bottom shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle border border-slate-200 dark:border-slate-700">
              <div className="bg-white dark:bg-slate-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-bold leading-6 text-slate-900 dark:text-white mb-4">
                  修改密码 - {passwordModalUser.name}
                </h3>
                <Form
                  method="post"
                  ref={passwordFormRef}
                  className="space-y-4"
                >
                  <input type="hidden" name="intent" value="updatePassword" />
                  <input
                    type="hidden"
                    name="userId"
                    value={passwordModalUser.id}
                  />
                  {actionData?.error && passwordModalUser && (
                    <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-600 dark:text-rose-400">
                      {actionData.error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      新密码
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
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
                      onClick={() => setPasswordModalUser(null)}
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
