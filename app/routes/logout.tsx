import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { logout, getUserId } from "../core/session.server";
import { getUserById } from "../services/user.server";
import { createAuditLog } from "../services/audit.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getUserId(request);
  if (userId) {
    const user = await getUserById(userId);
    if (user) {
      createAuditLog({
        user_id: user.id,
        user_name: user.name,
        action: "登出",
        entity: "用户",
        entity_id: user.id.toString(),
        details: "用户退出系统",
      }, request);
    }
  }
  return logout(request);
}

export async function loader() {
  return redirect("/");
}
