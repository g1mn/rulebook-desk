import { Outlet } from "react-router";

export function meta() {
  return [{ title: "Rulebook Desk" }];
}

export default function DeskLayout() {
  return <Outlet />;
}
