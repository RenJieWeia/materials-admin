import { Form, useNavigation, redirect, useSearchParams } from "react-router";
import { useState, useEffect, useRef } from "react";
import type { Route } from "./+types/users";
import { getUsers, createUser, updateUserPassword, getUserById, deleteUser, updateUserProfile } from "./model/user.server";
import { requireUserId } from "./server/session.server";
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
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">用户管理</h1>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          添加用户
        </button>
      </div>

      {/* Search Filters */}
      <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm transition-colors duration-200">
        <Form method="get" className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              用户名
            </label>
            <input
              type="text"
              name="name"
              defaultValue={filters.name}
              placeholder="搜索用户名..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              邮箱
            </label>
            <input
              type="text"
              name="email"
              defaultValue={filters.email}
              placeholder="搜索邮箱..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="role"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              角色
            </label>
            <select
              name="role"
              defaultValue={filters.role || ""}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="admin">管理员</option>
              <option value="user">员工</option>
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
              href="/users"
              className="ml-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              重置
            </a>
          </div>
        </Form>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm transition-colors duration-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  用户名
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  姓名
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  邮箱
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  角色
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  创建时间
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300"
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {user.id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                    {user.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {user.real_name || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {user.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      }`}
                    >
                      {user.role === "admin" ? "管理员" : "员工"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(user.created_at).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-medium">
                    <button
                      onClick={() => setEditModalUser(user)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setPasswordModalUser(user)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                    >
                      修改密码
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
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        删除
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
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

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setIsAddModalOpen(false)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                  添加用户
                </h3>
                <Form method="post" ref={formRef} className="mt-4 space-y-4">
                  <input type="hidden" name="intent" value="create" />
                  {actionData?.error && !passwordModalUser && (
                    <div className="text-sm text-red-600 dark:text-red-400">
                      {actionData.error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      用户名
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      姓名
                    </label>
                    <input
                      type="text"
                      name="real_name"
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      邮箱
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      密码
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      角色
                    </label>
                    <select
                      name="role"
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    >
                      <option value="user">员工</option>
                      <option value="admin">管理员</option>
                    </select>
                  </div>
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
                      onClick={() => setIsAddModalOpen(false)}
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

      {/* Edit User Modal */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setEditModalUser(null)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                  编辑用户
                </h3>
                <Form
                  method="post"
                  ref={editFormRef}
                  className="mt-4 space-y-4"
                >
                  <input type="hidden" name="intent" value="updateProfile" />
                  <input type="hidden" name="userId" value={editModalUser.id} />
                  {actionData?.error && editModalUser && (
                    <div className="text-sm text-red-600 dark:text-red-400">
                      {actionData.error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      用户名
                    </label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={editModalUser.name}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      姓名
                    </label>
                    <input
                      type="text"
                      name="real_name"
                      defaultValue={editModalUser.real_name || ""}
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      邮箱
                    </label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={editModalUser.email}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
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
                      onClick={() => setEditModalUser(null)}
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

      {/* Change Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity"
              aria-hidden="true"
            >
              <div
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setPasswordModalUser(null)}
              ></div>
            </div>
            <span
              className="hidden sm:inline-block sm:h-screen sm:align-middle"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <div className="relative inline-block transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <div className="bg-white dark:bg-gray-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                  修改密码 - {passwordModalUser.name}
                </h3>
                <Form
                  method="post"
                  ref={passwordFormRef}
                  className="mt-4 space-y-4"
                >
                  <input type="hidden" name="intent" value="updatePassword" />
                  <input
                    type="hidden"
                    name="userId"
                    value={passwordModalUser.id}
                  />
                  {actionData?.error && passwordModalUser && (
                    <div className="text-sm text-red-600 dark:text-red-400">
                      {actionData.error}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      新密码
                    </label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
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
                      onClick={() => setPasswordModalUser(null)}
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
