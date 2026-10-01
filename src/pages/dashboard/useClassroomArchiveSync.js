import { useEffect } from "react";
import { supabase } from "../../supabaseClient";

// Realtime for immediate updates, with focus/polling reconciliation if Realtime is unavailable.
export function useClassroomArchiveSync(classrooms, setClassrooms) {
  const ids = JSON.stringify(classrooms.map((c) => c.id).sort());
  useEffect(() => {
    const classroomIds = JSON.parse(ids);
    if (!classroomIds.length) return undefined;
    let cancelled = false;
    let pending = false;
    function apply(rows) {
      if (cancelled) return;
      const values = new Map(rows.filter((row) => typeof row.is_archived === "boolean").map((row) => [row.id, row.is_archived]));
      setClassrooms((current) => current.map((c) => values.has(c.id) ? { ...c, isArchived: values.get(c.id) } : c));
    }
    async function refresh() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const { data, error } = await supabase.from("classroomTable").select("id, is_archived").in("id", classroomIds);
        if (!error && Array.isArray(data)) apply(data);
      } finally { pending = false; }
    }
    const reconcile = () => { refresh().catch(() => {}); };
    const channel = supabase.channel?.(`classroom-archive-${classroomIds.join("-")}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "classroomTable" }, ({ new: row }) => {
        if (classroomIds.includes(row.id)) apply([row]);
      }).subscribe();
    const timer = setInterval(reconcile, 30000);
    window.addEventListener("focus", reconcile);
    window.addEventListener("storage", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", reconcile);
      window.removeEventListener("storage", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
      if (channel) supabase.removeChannel(channel);
    };
  }, [ids, setClassrooms]);
}
