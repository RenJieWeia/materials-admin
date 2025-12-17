import { redirect } from "react-router";
import { getUserId } from "./server/session.server";
import type { Route } from "./+types/index";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getUserId(request)) {
    return redirect("/dashboard");
  }
  return redirect("/login");
}
export default function Index() {
  return <></>;
}
