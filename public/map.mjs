// AMap Web-service static images, requested through our local authenticated proxy.
// Leaflet supplies pan/zoom/markers; both image and points use GCJ-02 values.
export function attachAmap(
  map,
  L,
  { endpoint = "/api/find-museum/map", onError = () => {} } = {},
) {
  let overlay = null,
    timer = null,
    disposed = false,
    generation = 0;
  if (!map.getPane("museum-basemap"))
    map.createPane("museum-basemap").style.zIndex = 200;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (disposed) return;
      const ticket = ++generation;
      const s = map.getSize(),
        w = Math.max(128, Math.min(1024, Math.round(s.x))),
        h = Math.max(128, Math.min(1024, Math.round(s.y))),
        z = Math.max(1, Math.min(17, Math.round(map.getZoom()))),
        c = map.getCenter();
      const center = map.project(c, z),
        a = map.unproject(center.subtract([w / 2, h / 2]), z),
        b = map.unproject(center.add([w / 2, h / 2]), z);
      const u =
        endpoint +
        "?" +
        new URLSearchParams({
          lng: c.lng.toFixed(6),
          lat: c.lat.toFixed(6),
          zoom: z,
          width: w,
          height: h,
        });
      const next = L.imageOverlay(u, L.latLngBounds(a, b), {
        interactive: false,
        opacity: 1,
        pane: "museum-basemap",
      }).addTo(map);
      next.once("load", () => {
        if (disposed || ticket !== generation) {
          next.remove();
          return;
        }
        overlay?.remove();
        overlay = next;
        onError("");
      });
      next.once("error", () => {
        next.remove();
        if (disposed || ticket !== generation) return;
        onError("地图暂不可用：请检查高德Key配置、网络或配额。馆单仍可使用。");
      });
    }, 240);
  };
  map.attributionControl.addAttribution(
    "&copy; 高德地图 审图号与数据来源以图面标注为准",
  );
  map.on("moveend resize", refresh);
  refresh();
  return () => {
    disposed = true;
    clearTimeout(timer);
    map.off("moveend resize", refresh);
    overlay?.remove();
  };
}
