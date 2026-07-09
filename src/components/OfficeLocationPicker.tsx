import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MapPin, Search, Link2 } from "lucide-react";

// Leaflet CSS — loaded once via a <link> tag injected into <head>
function ensureLeafletCSS() {
  if (document.getElementById("leaflet-css")) return;
  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(link);
}

interface Props {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

/** Parse lat/lng out of a Google Maps URL if present. Returns null if not a maps link. */
function parseGmapLink(raw: string): { lat: number; lng: number } | null {
  try {
    const url = new URL(raw.trim());
    const isGmap =
      url.hostname.includes("google.com") ||
      url.hostname.includes("maps.app.goo.gl") ||
      url.hostname.includes("goo.gl");
    if (!isGmap) return null;

    // Pattern: @lat,lng or ?q=lat,lng
    const atMatch = raw.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

    const qMatch = raw.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

    const llMatch = raw.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
  } catch {
    // not a URL
  }
  return null;
}

export function OfficeLocationPicker({ lat, lng, onChange }: Props) {
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [searchVal, setSearchVal] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const initialLat = lat && !isNaN(lat) ? lat : 20.5937;
  const initialLng = lng && !isNaN(lng) ? lng : 78.9629; // Default: India center

  // Initialise map on mount
  useEffect(() => {
    ensureLeafletCSS();

    let L: typeof import("leaflet");
    let cancelled = false;

    import("leaflet").then((mod) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      L = mod.default ?? mod;

      // Fix Leaflet's default icon paths broken by bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current!, { zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const startLat = lat && !isNaN(lat) ? lat : initialLat;
      const startLng = lng && !isNaN(lng) ? lng : initialLng;
      map.setView([startLat, startLng], lat ? 15 : 5);

      const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChange(parseFloat(pos.lat.toFixed(6)), parseFloat(pos.lng.toFixed(6)));
      });

      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        const { lat: clat, lng: clng } = e.latlng;
        marker.setLatLng([clat, clng]);
        onChange(parseFloat(clat.toFixed(6)), parseFloat(clng.toFixed(6)));
      });

      mapRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker when lat/lng props change externally
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return;
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], 15);
  }, [lat, lng]);

  const doSearch = useCallback(async () => {
    const raw = searchVal.trim();
    if (!raw) return;
    setSearchError("");

    // 1. Try parsing as a Google Maps link
    const parsed = parseGmapLink(raw);
    if (parsed) {
      onChange(parsed.lat, parsed.lng);
      return;
    }

    // 2. Nominatim geocoding
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(raw)}`,
        { headers: { "Accept-Language": "en" } },
      );
      const data = await res.json();
      if (!data || data.length === 0) {
        setSearchError("Location not found. Try a more specific name.");
        return;
      }
      const { lat: rlat, lon } = data[0] as { lat: string; lon: string };
      onChange(parseFloat(parseFloat(rlat).toFixed(6)), parseFloat(parseFloat(lon).toFixed(6)));
    } catch {
      setSearchError("Search failed — check your internet connection.");
    } finally {
      setSearching(false);
    }
  }, [searchVal, onChange]);

  return (
    <div className="space-y-3">
      {/* Search / paste link row */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          Search location or paste Google Maps link
        </Label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Guindy Industrial Estate Chennai, or paste maps.google.com link"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), doSearch())}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            onClick={doSearch}
            disabled={searching || !searchVal.trim()}
            className="shrink-0"
          >
            {searching ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
        {searchError && <p className="text-xs text-destructive">{searchError}</p>}
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Link2 className="h-3 w-3" />
          You can paste a Google Maps URL (e.g. maps.google.com/…@13.0827,80.2707) to auto-fill.
        </p>
      </div>

      {/* Leaflet map */}
      <div className="relative rounded-md overflow-hidden border" style={{ height: 280 }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
        <div className="absolute bottom-2 left-2 z-[1000] rounded bg-background/90 px-2 py-1 text-[11px] font-mono text-muted-foreground border shadow-sm pointer-events-none">
          <MapPin className="inline h-3 w-3 mr-1 text-primary" />
          {lat && !isNaN(lat) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Click map or search to set location"}
        </div>
      </div>

      {/* Manual override row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Latitude</Label>
          <Input
            value={lat && !isNaN(lat) ? String(lat) : ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(v, lng);
              else if (e.target.value === "" || e.target.value === "-") onChange(0, lng);
            }}
            placeholder="13.08268"
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Longitude</Label>
          <Input
            value={lng && !isNaN(lng) ? String(lng) : ""}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(lat, v);
              else if (e.target.value === "" || e.target.value === "-") onChange(lat, 0);
            }}
            placeholder="80.27860"
            className="font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
