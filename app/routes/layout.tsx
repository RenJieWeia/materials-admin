import { NavLink, Outlet, Form } from "react-router";
import type { Route } from "./+types/layout";
import { requireUserId } from "./server/session.server";
import { getUserById } from "./model/user.server";
import { useTheme } from "../components/ThemeProvider";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export async function loader({ request }: Route.LoaderArgs) {
  let userId = await requireUserId(request);
  const user = await getUserById(userId);
  return { user };
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <aside className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 shadow-md border-r border-gray-200 dark:border-gray-700">
        <div className="flex h-16 items-center justify-center border-b border-gray-200 dark:border-gray-700 px-6">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Material Admin</h1>
        </div>
        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `block rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                  }`
                }
              >
                工作台
              </NavLink>
            </li>
            {user?.role === "admin" && (
              <li>
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    `block rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                    }`
                  }
                >
                  账户管理
                </NavLink>
              </li>
            )}
            <li>
              <NavLink
                to="/materials"
                className={({ isActive }) =>
                  `block rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                  }`
                }
              >
                材料管理
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className="absolute bottom-0 w-64 border-t border-gray-200 dark:border-gray-700 p-4">
          <Form action="/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              退出登录
            </button>
          </Form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <header className="flex h-16 items-center justify-between bg-white dark:bg-gray-800 px-6 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Welcome back, {user?.name}</div>
          <button
            onClick={toggleTheme}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 focus:outline-none"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <SunIcon className="h-6 w-6" />
            ) : (
              <MoonIcon className="h-6 w-6" />
            )}
          </button>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
