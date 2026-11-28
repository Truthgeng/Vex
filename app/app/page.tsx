import type { Metadata } from "next";
import Desk from "../components/Desk";
import { Nav } from "../components/Chrome";
import { isMock } from "@/lib/server/scout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your desk · Vex" };

export default function DeskPage() {
  return (
    <>
      <div className="grain" aria-hidden />
      <Nav mock={isMock()} app />
      <div className="desk">
        <Desk />
      </div>
    </>
  );
}
