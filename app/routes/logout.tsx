import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { logout } from "./server/session.server";

export async function action({ request }: Route.ActionArgs) {
  return logout(request);
}

export async function loader() {
  return redirect("/");
}
