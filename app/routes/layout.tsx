import { NavLink, Outlet, Form, Link } from "react-router";
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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 font-sans">
      <aside className="w-64 flex-shrink-0 bg-white dark:bg-slate-800 shadow-sm border-r border-slate-200 dark:border-slate-700 z-10 flex flex-col">
        <div className="flex h-16 items-center px-6 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Material Admin</h1>
          </div>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Menu</div>
          <ul className="space-y-1">
            <li>
              <NavLink
                to="/dashboard"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200"
                  }`
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${({ isActive }: any) => isActive ? 'bg-blue-600' : 'bg-slate-400'} opacity-70`}></span>
                工作台
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/conversions"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200"
                  }`
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${({ isActive }: any) => isActive ? 'bg-blue-600' : 'bg-slate-400'} opacity-70`}></span>
                转化记录
              </NavLink>
            </li>
            {user?.role === "admin" && (
              <li>
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200"
                    }`
                  }
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${({ isActive }: any) => isActive ? 'bg-blue-600' : 'bg-slate-400'} opacity-70`}></span>
                  账户管理
                </NavLink>
              </li>
            )}
            <li>
              <NavLink
                to="/materials"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200"
                  }`
                }
              >
                <span className={`w-1.5 h-1.5 rounded-full ${({ isActive }: any) => isActive ? 'bg-blue-600' : 'bg-slate-400'} opacity-70`}></span>
                材料管理
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
          <Link to="/profile" className="flex items-center gap-3 mb-4 px-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-md py-2 transition-colors cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm group-hover:border-blue-400 transition-colors">
              {(user?.real_name || user?.name || "").slice(-2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{user?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{user?.role}</p>
            </div>
          </Link>
          <Form action="/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 hover:text-red-600 dark:hover:text-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <span>退出登录</span>
            </button>
          </Form>
        </div>
      </aside>
      
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between bg-white dark:bg-slate-800 px-8 shadow-sm border-b border-slate-200 dark:border-slate-700 z-10">
          <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
            <span className="mr-2">当前位置:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">
               管理系统
            </span>
          </div>
          <button
            onClick={toggleTheme}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 focus:outline-none transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <SunIcon className="h-5 w-5" />
            ) : (
              <MoonIcon className="h-5 w-5" />
            )}
          </button>
        </header>
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 scroll-smooth">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
