"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ApiError, api } from "./api";
import { fmtTime } from "./film-types";

export type ShapeType = "ARROW" | "CIRCLE" | "SPOTLIGHT" | "RECTANGLE" | "FREEHAND" | "TEXT";

export interface AnnotationShape {
  id: string;
  type: ShapeType;
  color: string;
  strokeWidth?: number;
  coordinates: {
    x1: number;
    y1: number;
    x2?: number;
    y2?: number;
    radius?: number;
    points?: Array<{ x: number; y: number }>;
    text?: string;
  };
}

export interface FilmAnnotation {
  id: string;
  gameId: string;
  clipId: string | null;
  timestampMs: number;
  durationMs: number;
  title: string;
  category: string;
  shapes: AnnotationShape[];
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface TelestratorCanvasProps {
  gameId: string;
  currentTimestampMs?: number;
  onSeek?: (timestampMs: number) => void;
  canManage?: boolean;
  clipId?: string;
}

const COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#10b981" },
  { label: "Amber", value: "#f59e0b" },
  { label: "White", value: "#ffffff" },
];

const CATEGORIES = [
  "TACTICAL",
  "OFFENSIVE_SPACING",
  "DEFENSIVE_BREAKDOWN",
  "SET_PLAY",
  "TRANSITION",
];

export function TelestratorCanvas({
  gameId,
  currentTimestampMs = 0,
  onSeek,
  canManage = true,
  clipId,
}: TelestratorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Drawing state
  const [activeTool, setActiveTool] = useState<ShapeType>("ARROW");
  const [selectedColor, setSelectedColor] = useState<string>("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [textInput, setTextInput] = useState<string>("");
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentShape, setCurrentShape] = useState<AnnotationShape | null>(null);

  // Annotations list & persistence
  const [annotations, setAnnotations] = useState<FilmAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("TACTICAL");
  const [durationMs, setDurationMs] = useState<number>(3000);
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const loadAnnotations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = clipId
        ? `/film/games/${gameId}/annotations?clipId=${clipId}`
        : `/film/games/${gameId}/annotations`;
      const res = await api<{ items: FilmAnnotation[] }>(url);
      setAnnotations(res.items || []);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setError(err instanceof Error ? err.message : "Failed to load annotations");
      }
    } finally {
      setIsLoading(false);
    }
  }, [gameId, clipId]);

  useEffect(() => {
    void loadAnnotations();
  }, [loadAnnotations]);

  // Coordinates helper (normalizes to 0-100%)
  const getCoordinates = (e: ReactMouseEvent<SVGSVGElement>): { x: number; y: number } => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  const handleMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    const { x, y } = getCoordinates(e);
    setIsDrawing(true);

    const shapeId = `shape_${Date.now()}`;
    if (activeTool === "ARROW" || activeTool === "RECTANGLE") {
      setCurrentShape({
        id: shapeId,
        type: activeTool,
        color: selectedColor,
        strokeWidth,
        coordinates: { x1: x, y1: y, x2: x, y2: y },
      });
    } else if (activeTool === "CIRCLE" || activeTool === "SPOTLIGHT") {
      setCurrentShape({
        id: shapeId,
        type: activeTool,
        color: selectedColor,
        strokeWidth,
        coordinates: { x1: x, y1: y, radius: 0 },
      });
    } else if (activeTool === "FREEHAND") {
      setCurrentShape({
        id: shapeId,
        type: "FREEHAND",
        color: selectedColor,
        strokeWidth,
        coordinates: { x1: x, y1: y, points: [{ x, y }] },
      });
    } else if (activeTool === "TEXT") {
      const textVal = textInput.trim() || "Cut";
      const newShape: AnnotationShape = {
        id: shapeId,
        type: "TEXT",
        color: selectedColor,
        coordinates: { x1: x, y1: y, text: textVal },
      };
      setShapes((prev) => [...prev, newShape]);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !currentShape) return;
    const { x, y } = getCoordinates(e);

    if (currentShape.type === "ARROW" || currentShape.type === "RECTANGLE") {
      setCurrentShape({
        ...currentShape,
        coordinates: { ...currentShape.coordinates, x2: x, y2: y },
      });
    } else if (currentShape.type === "CIRCLE" || currentShape.type === "SPOTLIGHT") {
      const dx = x - currentShape.coordinates.x1;
      const dy = y - currentShape.coordinates.y1;
      const radius = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
      setCurrentShape({
        ...currentShape,
        coordinates: { ...currentShape.coordinates, radius },
      });
    } else if (currentShape.type === "FREEHAND") {
      const pts = currentShape.coordinates.points || [];
      setCurrentShape({
        ...currentShape,
        coordinates: { ...currentShape.coordinates, points: [...pts, { x, y }] },
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentShape) {
      setShapes((prev) => [...prev, currentShape]);
      setCurrentShape(null);
    }
  };

  const handleUndo = () => {
    setShapes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setShapes([]);
    setCurrentShape(null);
  };

  const handleSaveAnnotation = async () => {
    if (shapes.length === 0) {
      setError("Please draw at least one shape on the court before saving.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await api(`/film/games/${gameId}/annotations`, {
        method: "POST",
        body: {
          clipId: clipId || undefined,
          timestampMs: currentTimestampMs,
          durationMs,
          title: title.trim() || `Keyframe at ${fmtTime(currentTimestampMs)}`,
          category,
          shapes,
          notes: notes.trim() || undefined,
        },
      });
      setTitle("");
      setNotes("");
      await loadAnnotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save annotation");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this annotation?")) return;
    try {
      await api(`/film/games/${gameId}/annotations/${id}`, { method: "DELETE" });
      if (selectedAnnotationId === id) {
        setSelectedAnnotationId(null);
        setShapes([]);
      }
      await loadAnnotations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete annotation");
    }
  };

  const handleSelectAnnotation = (annotation: FilmAnnotation) => {
    setSelectedAnnotationId(annotation.id);
    setShapes(annotation.shapes || []);
    if (onSeek) {
      onSeek(annotation.timestampMs);
    }
  };

  const filteredAnnotations = annotations.filter((a) =>
    categoryFilter === "ALL" ? true : a.category === categoryFilter
  );

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-100">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-lg text-emerald-400">Telestrator Studio</span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400">
            {fmtTime(currentTimestampMs)}
          </span>
        </div>

        {/* Tools Palette */}
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Telestrator drawing tools">
          {(["ARROW", "CIRCLE", "SPOTLIGHT", "RECTANGLE", "FREEHAND", "TEXT"] as ShapeType[]).map((tool) => (
            <button
              key={tool}
              type="button"
              onClick={() => setActiveTool(tool)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeTool === tool
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {tool.charAt(0) + tool.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5" aria-label="Color selector">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.label}
              onClick={() => setSelectedColor(c.value)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${
                selectedColor === c.value ? "scale-110 border-white ring-2 ring-emerald-400" : "border-slate-700 hover:scale-105"
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        {/* Stroke Width Selector */}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span>Width:</span>
          {[2, 3, 5].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setStrokeWidth(w)}
              className={`px-2 py-0.5 rounded font-mono ${
                strokeWidth === w ? "bg-slate-700 text-white font-bold" : "bg-slate-800 text-slate-400"
              }`}
            >
              {w}px
            </button>
          ))}
        </div>

        {/* Clear & Undo */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={shapes.length === 0}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={shapes.length === 0}
            className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-300 rounded disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      {activeTool === "TEXT" && (
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded border border-slate-800">
          <label htmlFor="text-annotation-input" className="text-xs text-slate-400">Text Label:</label>
          <input
            id="text-annotation-input"
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="e.g. Cut, Flare, Roll, Help"
            className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-100 flex-1"
          />
          <span className="text-xs text-slate-400">Click canvas to place</span>
        </div>
      )}

      {/* Main Telestrator Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Visual Drawing Canvas */}
        <div className="lg:col-span-3 relative bg-black/80 rounded-lg overflow-hidden border border-slate-800 aspect-video flex items-center justify-center">
          {/* SVG Overlay */}
          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full cursor-crosshair select-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            aria-label="Telestrator visual overlay"
          >
            <defs>
              <marker
                id="arrowhead-red"
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#ef4444" />
              </marker>
              <marker
                id="arrowhead-blue"
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#3b82f6" />
              </marker>
              <marker
                id="arrowhead-green"
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#10b981" />
              </marker>
              <marker
                id="arrowhead-amber"
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#f59e0b" />
              </marker>
              <marker
                id="arrowhead-white"
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#ffffff" />
              </marker>
            </defs>

            {/* Render saved / active shapes */}
            {[...shapes, ...(currentShape ? [currentShape] : [])].map((s) => {
              const markerId =
                s.color === "#ef4444"
                  ? "url(#arrowhead-red)"
                  : s.color === "#3b82f6"
                  ? "url(#arrowhead-blue)"
                  : s.color === "#10b981"
                  ? "url(#arrowhead-green)"
                  : s.color === "#f59e0b"
                  ? "url(#arrowhead-amber)"
                  : "url(#arrowhead-white)";

              if (s.type === "ARROW") {
                return (
                  <line
                    key={s.id}
                    x1={s.coordinates.x1}
                    y1={s.coordinates.y1}
                    x2={s.coordinates.x2 ?? s.coordinates.x1}
                    y2={s.coordinates.y2 ?? s.coordinates.y1}
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 3}
                    strokeLinecap="round"
                    markerEnd={markerId}
                  />
                );
              }

              if (s.type === "CIRCLE") {
                return (
                  <circle
                    key={s.id}
                    cx={s.coordinates.x1}
                    cy={s.coordinates.y1}
                    r={s.coordinates.radius ?? 5}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 3}
                  />
                );
              }

              if (s.type === "SPOTLIGHT") {
                return (
                  <circle
                    key={s.id}
                    cx={s.coordinates.x1}
                    cy={s.coordinates.y1}
                    r={s.coordinates.radius ?? 8}
                    fill={s.color}
                    fillOpacity="0.25"
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 2}
                    strokeDasharray="2,2"
                  />
                );
              }

              if (s.type === "RECTANGLE") {
                const x = Math.min(s.coordinates.x1, s.coordinates.x2 ?? s.coordinates.x1);
                const y = Math.min(s.coordinates.y1, s.coordinates.y2 ?? s.coordinates.y1);
                const w = Math.abs((s.coordinates.x2 ?? s.coordinates.x1) - s.coordinates.x1);
                const h = Math.abs((s.coordinates.y2 ?? s.coordinates.y1) - s.coordinates.y1);
                return (
                  <rect
                    key={s.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 3}
                  />
                );
              }

              if (s.type === "FREEHAND" && s.coordinates.points) {
                const pathData = s.coordinates.points
                  .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                  .join(" ");
                return (
                  <path
                    key={s.id}
                    d={pathData}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.strokeWidth ?? 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              }

              if (s.type === "TEXT") {
                return (
                  <text
                    key={s.id}
                    x={s.coordinates.x1}
                    y={s.coordinates.y1}
                    fill={s.color}
                    fontSize="4"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="drop-shadow-md select-none"
                  >
                    {s.coordinates.text}
                  </text>
                );
              }

              return null;
            })}
          </svg>

          {shapes.length === 0 && !currentShape && (
            <div className="pointer-events-none text-center text-slate-500 text-sm select-none">
              <p>Click & drag to draw tactical overlay on court</p>
              <p className="text-xs mt-1 text-slate-600">Select tools above: Arrow, Circle, Spotlight, Rectangle, Freehand, Text</p>
            </div>
          )}
        </div>

        {/* Annotations & Keyframe Management Drawer */}
        <div className="flex flex-col gap-3">
          {/* Keyframe Save Form */}
          {canManage && (
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Save Keyframe Annotation
              </span>

              <input
                type="text"
                placeholder="Annotation title (e.g. Backdoor cut)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100"
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.replace("_", " ")}
                    </option>
                  ))}
                </select>

                <select
                  value={durationMs}
                  onChange={(e) => setDurationMs(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                >
                  <option value={1500}>1.5s Hold</option>
                  <option value={3000}>3.0s Hold</option>
                  <option value={5000}>5.0s Hold</option>
                  <option value={8000}>8.0s Hold</option>
                </select>
              </div>

              <textarea
                placeholder="Tactical coaching notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 resize-none"
              />

              <button
                type="button"
                onClick={handleSaveAnnotation}
                disabled={isSaving || shapes.length === 0}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded text-xs font-medium transition-colors"
              >
                {isSaving ? "Saving..." : "Save Keyframe Overlay"}
              </button>
            </div>
          )}

          {/* Annotations List */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">
              Keyframes ({filteredAnnotations.length})
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-2 rounded bg-red-950/60 border border-red-800 text-red-300 text-xs">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="p-4 text-center text-xs text-slate-500 animate-pulse">
              Loading annotations...
            </div>
          ) : filteredAnnotations.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">
              No telestrator annotations yet for this game.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredAnnotations.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectAnnotation(item)}
                  className={`p-2.5 rounded border text-xs cursor-pointer transition-colors ${
                    selectedAnnotationId === item.id
                      ? "bg-slate-800 border-emerald-500"
                      : "bg-slate-950 border-slate-800 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-slate-200 truncate">{item.title}</span>
                    <span className="font-mono text-emerald-400 font-semibold shrink-0">
                      {fmtTime(item.timestampMs)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {item.category.replace("_", " ")}
                    </span>
                    <span>{item.shapes.length} shape{item.shapes.length === 1 ? "" : "s"}</span>
                  </div>

                  {item.notes && (
                    <p className="mt-1.5 text-slate-400 italic line-clamp-2">{item.notes}</p>
                  )}

                  {canManage && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteAnnotation(item.id);
                        }}
                        className="text-[11px] text-red-400 hover:text-red-300 underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
