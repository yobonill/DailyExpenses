import { describe,it,expect } from "vitest";
import { createEmptyFinancialData } from "./financialState";
import { buildClosing,reviewMeta } from "./financialReview";
import { historyCycleMonths,movementCycleBounds,assertMovementCycleDate,cycleStatus } from "./historyCycles";
const fixture=()=>{const d=createEmptyFinancialData();d.moneyAccounts.cash={id:"cash",kind:"cash",name:"Efectivo",currency:"DOP",openingBalanceMinor:10000,openingDate:"2026-08-15",active:true,...reviewMeta("test")};return d;};
const close=(d:ReturnType<typeof fixture>,month:string,q:1|2)=>{const c=buildClosing(d,month,q,{},"","test");d.cycleClosings[c.id]=c;};
describe("cycle-driven movement dates",()=>{
 it("lists financial cycles, including the current cycle, instead of calendar month ranges",()=>{
  expect(historyCycleMonths(fixture(),"2026-10-17")).toEqual(["2026-10","2026-09","2026-08"]);
  expect(historyCycleMonths(fixture(),"2026-10-14")[0]).toBe("2026-09");
 });
 it("omits fully closed cycles from the add selector but retains them for history",()=>{
  const d=fixture();close(d,"2026-08",1);close(d,"2026-08",2);
  expect(historyCycleMonths(d,"2026-10-17")).toContain("2026-08");
  expect(movementCycleBounds(d,"2026-08","2026-10-17")).toBeNull();expect(cycleStatus(d,"2026-08")).toBe("Cerrado");
 });
 it("allows only the open half of a partially closed cycle",()=>{
  const d=fixture();close(d,"2026-09",1);
  expect(movementCycleBounds(d,"2026-09","2026-10-17")).toEqual({startDateKey:"2026-09-30",endDateKey:"2026-10-14"});
  expect(()=>assertMovementCycleDate(d,"2026-09","2026-09-20","2026-10-17")).toThrow();
  expect(()=>assertMovementCycleDate(d,"2026-09","2026-10-14","2026-10-17")).not.toThrow();
 });
 it("rejects a date from another cycle, a future date, or a blank date",()=>{
  const d=fixture();expect(movementCycleBounds(d,"2026-10","2026-10-17")).toEqual({startDateKey:"2026-10-15",endDateKey:"2026-10-17"});
  for(const date of ["2026-10-14","2026-10-18",""])expect(()=>assertMovementCycleDate(d,"2026-10",date,"2026-10-17")).toThrow();
 });
 it("rechecks a cycle that closes while a form is open",()=>{
  const d=fixture();expect(()=>assertMovementCycleDate(d,"2026-09","2026-10-01","2026-10-17")).not.toThrow();close(d,"2026-09",2);
  expect(()=>assertMovementCycleDate(d,"2026-09","2026-10-01","2026-10-17")).toThrow();
 });
 it("handles February and the previous December boundary",()=>{
  const d=fixture();expect(movementCycleBounds(d,"2024-02","2026-10-17")).toEqual({startDateKey:"2024-02-15",endDateKey:"2024-03-14"});
  expect(movementCycleBounds(d,"2025-12","2026-01-02")).toEqual({startDateKey:"2025-12-15",endDateKey:"2026-01-02"});
 });
});
