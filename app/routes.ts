import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/index.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/layout.tsx", [
    route("dashboard", "routes/dashboard.tsx"),
    route("materials", "routes/materials.tsx"),
    route("users", "routes/users.tsx"),
    route("profile", "routes/profile.tsx"),
    route("conversions", "routes/conversions.tsx"),
    route("audit", "routes/audit.tsx"),
  ]),
  route("resources/material-template", "routes/resources/material-template.ts"),
] satisfies RouteConfig;
