import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Artwork, ArtworkEditorTool } from '../types';

interface ArtworkEditorProps {
  isOpen: boolean;
  artwork: (Artwork & { productName?: string; productSku?: string }) | null;
  onClose: () => void;
  onSave: (dataUrl: string, vectorSvg?: string) => void;
}

export const ArtworkEditor: React.FC<ArtworkEditorProps> = ({
  isOpen,
  artwork,
  onClose,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<ArtworkEditorTool>('brush');
  const [color, setColor] = useState('#f4b400');
  const [brushSize, setBrushSize] = useState(6);
  const [textSize, setTextSize] = useState(32);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textCanvasPos, setTextCanvasPos] = useState({ x: 0, y: 0 });
  const [textScreenPos, setTextScreenPos] = useState({ x: 0, y: 0 });
  const [historyStep, setHistoryStep] = useState(-1);
  const [vectorSvg, setVectorSvg] = useState<string | null>(null);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);

  const safeFileStem = useMemo(() => {
    const fileName = artwork?.fileName ?? 'artwork';
    return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9-_]/gi, '_');
  }, [artwork]);

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    setHistoryStep(-1);
  }, []);

  const pushHistory = useCallback(() => {
    if (!ctx || !canvasRef.current) return;
    try {
      const snapshot = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const truncated = historyRef.current.slice(0, historyStep + 1);
      truncated.push(snapshot);
      historyRef.current = truncated;
      setHistoryStep(truncated.length - 1);
    } catch (snapshotError) {
      console.warn('Unable to capture history snapshot', snapshotError);
    }
  }, [ctx, historyStep]);

  const blobToDataUrl = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const loadArtworkImage = useCallback(async () => {
    if (!isOpen || !artwork?.url || !canvasRef.current) return;
    setError(null);
    setLoadingImage(true);
    resetHistory();

    try {
      let sourceUrl = artwork.url;
      if (!sourceUrl.startsWith('data:')) {
        const response = await fetch(sourceUrl);
        const blob = await response.blob();
        sourceUrl = await blobToDataUrl(blob);
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) {
          setLoadingImage(false);
          setError('Canvas unavailable in this browser.');
          return;
        }
        canvas.width = img.width;
        canvas.height = img.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0);
        setCtx(context);
        try {
          const initialSnapshot = context.getImageData(0, 0, canvas.width, canvas.height);
          historyRef.current = [initialSnapshot];
          setHistoryStep(0);
        } catch (snapshotError) {
          console.warn('Unable to capture initial history snapshot', snapshotError);
        }
        setVectorSvg(null);
        setLoadingImage(false);
      };
      img.onerror = () => {
        setLoadingImage(false);
        setError('Failed to load artwork preview.');
      };
      img.src = sourceUrl;
    } catch (imageError) {
      setLoadingImage(false);
      setError('Failed to fetch artwork file. Check permissions.');
    }
  }, [artwork, isOpen, resetHistory]);

  useEffect(() => {
    loadArtworkImage();
  }, [loadArtworkImage]);

  useEffect(() => {
    if (isOpen && artwork?.vectorSvg) {
      setVectorSvg(artwork.vectorSvg);
    }
    if (!isOpen) {
      setVectorSvg(null);
    }
  }, [artwork, isOpen]);

  const getEventPosition = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    let clientX: number;
    let clientY: number;
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    return { clientX, clientY };
  };

  const startDrawing = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    if (tool === 'text') {
      event.preventDefault();
      handleTextPlacement(event);
      return;
    }
    setIsDrawing(true);
    draw(event);
  };

  const handleTextPlacement = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !workspaceRef.current) return;
    const { clientX, clientY } = getEventPosition(event);
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const workspaceRect = workspaceRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / canvasRect.width;
    const scaleY = canvasRef.current.height / canvasRect.height;

    setTextCanvasPos({
      x: (clientX - canvasRect.left) * scaleX,
      y: (clientY - canvasRect.top) * scaleY,
    });
    setTextScreenPos({
      x: clientX - workspaceRect.left,
      y: clientY - workspaceRect.top,
    });
    setTextInput('');
    setShowTextInput(true);
    setTimeout(() => {
      const input = document.getElementById('artwork-text-input') as HTMLInputElement | null;
      input?.focus();
    }, 0);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (ctx) ctx.beginPath();
    pushHistory();
  };

  const draw = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx || !canvasRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const { clientX, clientY } = getEventPosition(event);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = tool === 'text' ? textSize : brushSize;
    ctx.lineCap = 'round';

    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const addTextToCanvas = () => {
    if (!ctx || !textInput.trim()) {
      setShowTextInput(false);
      return;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.font = `600 ${textSize}px Inter, sans-serif`;
    ctx.fillText(textInput, textCanvasPos.x, textCanvasPos.y);
    setShowTextInput(false);
    setTextInput('');
    pushHistory();
  };

  const handleUndo = () => {
    if (!ctx || !canvasRef.current || historyStep <= 0) return;
    const previous = historyRef.current[historyStep - 1];
    if (!previous) return;
    ctx.putImageData(previous, 0, 0);
    setHistoryStep(historyStep - 1);
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSave(dataUrl, vectorSvg ?? undefined);
      setVectorSvg(null);
    } catch (saveError) {
      setError('Unable to export PNG from this browser.');
    }
  };

  const handleDownloadRaster = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${safeFileStem}-edited.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleVectorize = () => {
    if (!canvasRef.current) return;
    if (!window.ImageTracer?.imageToSVG) {
      setError('Vector engine failed to load. Refresh and try again.');
      return;
    }
    setIsVectorizing(true);
    setError(null);
    const dataUrl = canvasRef.current.toDataURL('image/png');
    window.ImageTracer.imageToSVG(
      dataUrl,
      (svgString) => {
        setVectorSvg(svgString);
        setIsVectorizing(false);
      },
      {
        numberofcolors: 48,
        mincolorratio: 0.01,
        colorsampling: 2,
        linefilter: true,
      }
    );
  };

  const handleDownloadVector = () => {
    if (!vectorSvg) return;
    const blob = new Blob([vectorSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileStem}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBundle = async () => {
    if (!canvasRef.current || !window.JSZip) return handleDownloadRaster();
    const zip = new window.JSZip();
    const pngDataUrl = canvasRef.current.toDataURL('image/png');
    const pngBase64 = pngDataUrl.split(',')[1];
    zip.file(`${safeFileStem}.png`, pngBase64, { base64: true });
    if (vectorSvg) {
      zip.file(`${safeFileStem}.svg`, vectorSvg);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${safeFileStem}_export.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !artwork) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/90">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-gray-400">Artwork Editor</p>
          <h2 className="text-xl font-semibold text-white">
            {artwork.fileName}
          </h2>
          {(artwork.productName || artwork.productSku) && (
            <p className="text-sm text-gray-400">
              {artwork.productName} {artwork.productSku && `• ${artwork.productSku}`}
            </p>
          )}
        </div>
      <div className="flex items-center gap-3">
          <button
            onClick={handleUndo}
            disabled={historyStep <= 0}
            className="px-3 py-2 rounded-md border border-gray-700 text-sm text-gray-200 disabled:opacity-30 hover:bg-gray-800"
          >
            Undo
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-2 rounded-md bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
          >
            Save to Library
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r border-gray-800 bg-gray-900/70 p-4 space-y-6">
          <section>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tool</p>
            <div className="grid grid-cols-3 gap-2">
              {(['brush', 'text', 'eraser'] as ArtworkEditorTool[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={`py-2 text-sm rounded-md border ${
                    tool === t ? 'border-indigo-400 text-white bg-indigo-500/20' : 'border-gray-700 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  {t === 'brush' ? 'Brush' : t === 'text' ? 'Text' : 'Erase'}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <label className="text-xs text-gray-400 uppercase tracking-wide">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full h-10 rounded-md border border-gray-700 bg-gray-800"
            />
          </section>

          <section className="space-y-3">
            <label className="text-xs text-gray-400 uppercase tracking-wide">
              {tool === 'text' ? 'Text Size' : 'Brush Size'} ({tool === 'text' ? textSize : brushSize}px)
            </label>
            <input
              type="range"
              min={1}
              max={tool === 'text' ? 120 : 60}
              value={tool === 'text' ? textSize : brushSize}
              onChange={(e) => tool === 'text' ? setTextSize(Number(e.target.value)) : setBrushSize(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </section>

          <section className="space-y-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Exports</p>
            <div className="space-y-2">
              <button
                onClick={handleDownloadRaster}
                className="w-full py-2 rounded-md bg-gray-800 text-gray-100 hover:bg-gray-700 text-sm"
              >
                Download PNG
              </button>
              <button
                onClick={handleVectorize}
                disabled={isVectorizing}
                className="w-full py-2 rounded-md bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 text-sm"
              >
                {isVectorizing ? 'Vectorizing...' : 'Generate SVG'}
              </button>
              <button
                onClick={handleDownloadVector}
                disabled={!vectorSvg}
                className="w-full py-2 rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800 disabled:opacity-40 text-sm"
              >
                Download SVG
              </button>
              <button
                onClick={handleDownloadBundle}
                className="w-full py-2 rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800 text-sm"
              >
                Bundle (ZIP)
              </button>
            </div>
          </section>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-600/40 rounded-md p-3">
              {error}
            </p>
          )}
        </div>

        <div ref={workspaceRef} className="flex-1 relative bg-gray-950 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="max-h-full max-w-full rounded-lg border border-gray-800 bg-[radial-gradient(circle,_rgba(255,255,255,0.08)_1px,_transparent_1px)] [background-size:16px_16px]"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />

          {showTextInput && (
            <input
              id="artwork-text-input"
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onBlur={addTextToCanvas}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTextToCanvas();
                if (e.key === 'Escape') setShowTextInput(false);
              }}
              style={{ top: textScreenPos.y, left: textScreenPos.x }}
              className="absolute bg-white text-gray-900 px-2 py-1 rounded shadow-lg border border-indigo-500 focus:outline-none"
            />
          )}

          {loadingImage && (
            <div className="absolute inset-0 bg-gray-950/80 backdrop-blur flex items-center justify-center text-gray-200 text-sm">
              Loading artwork…
            </div>
          )}
        </div>

        <aside className="w-96 border-l border-gray-800 bg-gray-900/80 p-6 space-y-4 overflow-y-auto">
          <h3 className="text-lg font-semibold text-white">Vector Preview</h3>
          <p className="text-sm text-gray-400">
            Use the AI brush to clean up your label, then generate SVG outlines for Illustrator or CAD teams.
          </p>
          {artwork?.vectorGeneratedAt && (
            <p className="text-xs text-gray-500">
              Last vector export {new Date(artwork.vectorGeneratedAt).toLocaleString()}
            </p>
          )}
          <div className="rounded-lg border border-gray-800 bg-gray-950 min-h-[300px] flex items-center justify-center p-4">
            {vectorSvg ? (
              <div
                className="w-full h-full overflow-auto [&>svg]:w-full [&>svg]:h-full text-white"
                dangerouslySetInnerHTML={{ __html: vectorSvg }}
              />
            ) : (
              <p className="text-sm text-gray-500 text-center">Generate an SVG to preview the vector output.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ArtworkEditor;
