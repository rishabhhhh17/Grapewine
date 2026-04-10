import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUp, Paperclip, Square, X, StopCircle,
  Mic, Globe, BrainCog, FolderCode,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Grapewine color tokens ───────────────────────────────────────
// bg:          #0A0A0F   card-bg:   #13131F   card-bg-2: #1A1A2E
// border:      #1E1E2E   sidebar:   #0F0F1A
// violet:      #7C3AED   violet-lt: #A78BFA   cyan: #06B6D4
// text:        #F1F0FF   muted:     #8B8AA8   dim: #3D3D5C
// ─────────────────────────────────────────────────────────────────

const cn = (...classes: (string | undefined | null | false)[]) =>
  classes.filter(Boolean).join(" ");

// Inject minimal custom styles (scrollbar + focus ring reset)
const style = document.createElement("style");
style.innerText = `
  .gw-prompt *:focus-visible { outline-offset: 0 !important; }
  .gw-prompt textarea::-webkit-scrollbar { width: 5px; }
  .gw-prompt textarea::-webkit-scrollbar-track { background: transparent; }
  .gw-prompt textarea::-webkit-scrollbar-thumb { background-color: #2D2A4A; border-radius: 3px; }
  .gw-prompt textarea::-webkit-scrollbar-thumb:hover { background-color: #3D3A5A; }
`;
document.head.appendChild(style);

// ─── Textarea ─────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={1}
      className={cn(
        "flex w-full rounded-md border-none bg-transparent px-3 py-2.5 text-[15px] text-[#F1F0FF] placeholder:text-[#8B8AA8] focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] resize-none",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

// ─── Tooltip ──────────────────────────────────────────────────────
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip        = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-lg border border-[#1E1E2E] bg-[#0F0F1A] px-3 py-1.5 text-xs text-[#F1F0FF] shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// ─── Dialog ───────────────────────────────────────────────────────
const Dialog       = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[#0A0A0F]/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-[90vw] md:max-w-[800px] translate-x-[-50%] translate-y-[-50%] gap-4 border border-[#1E1E2E] bg-[#13131F] p-0 shadow-2xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-2xl",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 z-10 rounded-full bg-[#1A1A2E] p-2 hover:bg-[#1E1E2E] transition-all border border-[#1E1E2E]">
        <X className="h-4 w-4 text-[#8B8AA8] hover:text-[#F1F0FF]" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-[#F1F0FF]", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

// ─── Button ───────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const v = {
      default: "bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] text-white hover:opacity-90",
      outline: "border border-[#1E1E2E] bg-transparent hover:bg-[#1A1A2E]",
      ghost:   "bg-transparent hover:bg-[#1A1A2E]",
    };
    const s = {
      default: "h-10 px-4 py-2",
      sm:      "h-8 px-3 text-sm",
      lg:      "h-12 px-6",
      icon:    "h-8 w-8 rounded-full aspect-square",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          v[variant], s[size], className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// ─── VoiceRecorder ────────────────────────────────────────────────
interface VoiceRecorderProps {
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: (duration: number) => void;
  visualizerBars?: number;
}
const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  isRecording, onStartRecording, onStopRecording, visualizerBars = 32,
}) => {
  const [time, setTime] = React.useState(0);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    if (isRecording) {
      onStartRecording();
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      onStopRecording(time);
      setTime(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className={cn("flex flex-col items-center justify-center w-full transition-all duration-300 py-3", isRecording ? "opacity-100" : "opacity-0 h-0")}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <span className="font-mono text-sm text-[#F1F0FF]/80">{fmt(time)}</span>
      </div>
      <div className="w-full h-10 flex items-center justify-center gap-0.5 px-4">
        {[...Array(visualizerBars)].map((_, i) => (
          <div
            key={i}
            className="w-0.5 rounded-full bg-[#7C3AED]/60 animate-pulse"
            style={{
              height: `${Math.max(15, Math.random() * 100)}%`,
              animationDelay: `${i * 0.05}s`,
              animationDuration: `${0.5 + Math.random() * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

// ─── ImageViewDialog ──────────────────────────────────────────────
interface ImageViewDialogProps { imageUrl: string | null; onClose: () => void; }
const ImageViewDialog: React.FC<ImageViewDialogProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[90vw] md:max-w-[800px]">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative bg-[#13131F] rounded-2xl overflow-hidden shadow-2xl border border-[#1E1E2E]"
        >
          <img src={imageUrl} alt="Full preview" className="w-full max-h-[80vh] object-contain rounded-2xl" />
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

// ─── PromptInput context ──────────────────────────────────────────
interface PromptInputContextType {
  isLoading: boolean; value: string; setValue: (v: string) => void;
  maxHeight: number | string; onSubmit?: () => void; disabled?: boolean;
}
const PromptInputContext = React.createContext<PromptInputContextType>({
  isLoading: false, value: "", setValue: () => {}, maxHeight: 240,
});
const usePromptInput = () => React.useContext(PromptInputContext);

interface PromptInputProps {
  isLoading?: boolean; value?: string; onValueChange?: (v: string) => void;
  maxHeight?: number | string; onSubmit?: () => void; children: React.ReactNode;
  className?: string; disabled?: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}
const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ className, isLoading = false, maxHeight = 240, value, onValueChange, onSubmit, children, disabled = false, onDragOver, onDragLeave, onDrop }, ref) => {
    const [internalValue, setInternalValue] = React.useState(value || "");
    const handleChange = (v: string) => { setInternalValue(v); onValueChange?.(v); };
    return (
      <TooltipProvider>
        <PromptInputContext.Provider value={{ isLoading, value: value ?? internalValue, setValue: onValueChange ?? handleChange, maxHeight, onSubmit, disabled }}>
          <div
            ref={ref}
            className={cn(
              "rounded-2xl border bg-[#13131F] p-2 shadow-[0_8px_40px_rgba(0,0,0,0.4)] transition-all duration-300",
              isLoading ? "border-[#7C3AED]/60" : "border-[#1E1E2E] hover:border-[#2D2D4E]",
              className
            )}
            style={{ boxShadow: isLoading ? "0 0 0 1px rgba(124,58,237,0.3), 0 8px 40px rgba(0,0,0,0.4)" : undefined }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {children}
          </div>
        </PromptInputContext.Provider>
      </TooltipProvider>
    );
  }
);
PromptInput.displayName = "PromptInput";

// ─── PromptInputTextarea ──────────────────────────────────────────
interface PromptInputTextareaProps extends React.ComponentProps<typeof Textarea> {
  disableAutosize?: boolean;
  placeholder?: string;
}
const PromptInputTextarea: React.FC<PromptInputTextareaProps> = ({
  className, onKeyDown, disableAutosize = false, placeholder, ...props
}) => {
  const { value, setValue, maxHeight, onSubmit, disabled } = usePromptInput();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (disableAutosize || !textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height =
      typeof maxHeight === "number"
        ? `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`
        : `min(${textareaRef.current.scrollHeight}px, ${maxHeight})`;
  }, [value, maxHeight, disableAutosize]);

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit?.(); } onKeyDown?.(e as React.KeyboardEvent<HTMLTextAreaElement>); }}
      className={cn("text-[15px] leading-relaxed", className)}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
    />
  );
};

// ─── PromptInputActions ───────────────────────────────────────────
const PromptInputActions: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className, ...props }) => (
  <div className={cn("flex items-center gap-2", className)} {...props}>{children}</div>
);

// ─── PromptInputAction ────────────────────────────────────────────
interface PromptInputActionProps extends React.ComponentProps<typeof Tooltip> {
  tooltip: React.ReactNode; children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}
const PromptInputAction: React.FC<PromptInputActionProps> = ({ tooltip, children, className, side = "top", ...props }) => {
  const { disabled } = usePromptInput();
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild disabled={disabled}>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>{tooltip}</TooltipContent>
    </Tooltip>
  );
};

// ─── CustomDivider ────────────────────────────────────────────────
const CustomDivider: React.FC = () => (
  <div className="relative h-5 w-[1.5px] mx-0.5">
    <div
      className="absolute inset-0 rounded-full"
      style={{ background: "linear-gradient(to bottom, transparent, rgba(124,58,237,0.5), transparent)" }}
    />
  </div>
);

// ─── Toggle button helper ─────────────────────────────────────────
interface ModeButtonProps {
  active: boolean;
  activeColor: string;      // e.g. "#06B6D4"
  activeBg: string;         // e.g. "rgba(6,182,212,0.12)"
  activeBorder: string;     // e.g. "#06B6D4"
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}
const ModeButton: React.FC<ModeButtonProps> = ({ active, activeColor, activeBg, activeBorder, label, icon, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded-full transition-all flex items-center gap-1 px-2 py-1 h-8 border"
    style={
      active
        ? { background: activeBg, borderColor: activeBorder, color: activeColor }
        : { background: "transparent", borderColor: "transparent", color: "#8B8AA8" }
    }
    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#F1F0FF"; }}
    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#8B8AA8"; }}
  >
    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
      <motion.div
        animate={{ rotate: active ? 360 : 0, scale: active ? 1.1 : 1 }}
        whileHover={{ rotate: active ? 360 : 15, scale: 1.1, transition: { type: "spring", stiffness: 300, damping: 10 } }}
        transition={{ type: "spring", stiffness: 260, damping: 25 }}
      >
        {icon}
      </motion.div>
    </div>
    <AnimatePresence>
      {active && (
        <motion.span
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "auto", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs overflow-hidden whitespace-nowrap flex-shrink-0"
          style={{ color: activeColor }}
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  </button>
);

// ─── Main: PromptInputBox ─────────────────────────────────────────
interface PromptInputBoxProps {
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}
export const PromptInputBox = React.forwardRef(
  (props: PromptInputBoxProps, ref: React.Ref<HTMLDivElement>) => {
    const {
      onSend = () => {},
      isLoading = false,
      placeholder = "Describe the hiring managers you want to find…",
      className,
    } = props;

    const [input, setInput]                 = React.useState("");
    const [files, setFiles]                 = React.useState<File[]>([]);
    const [filePreviews, setFilePreviews]   = React.useState<Record<string, string>>({});
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
    const [isRecording, setIsRecording]     = React.useState(false);
    const [showSearch, setShowSearch]       = React.useState(false);
    const [showThink, setShowThink]         = React.useState(false);
    const [showCanvas, setShowCanvas]       = React.useState(false);
    const uploadInputRef = React.useRef<HTMLInputElement>(null);
    const promptBoxRef   = React.useRef<HTMLDivElement>(null);

    const toggleMode = (mode: "search" | "think" | "canvas") => {
      if (mode === "search") { setShowSearch(v => !v); setShowThink(false); setShowCanvas(false); }
      if (mode === "think")  { setShowThink(v => !v);  setShowSearch(false); setShowCanvas(false); }
      if (mode === "canvas") { setShowCanvas(v => !v); setShowSearch(false); setShowThink(false); }
    };

    const isImageFile = (f: File) => f.type.startsWith("image/");

    const processFile = (file: File) => {
      if (!isImageFile(file) || file.size > 10 * 1024 * 1024) return;
      setFiles([file]);
      const reader = new FileReader();
      reader.onload = e => setFilePreviews({ [file.name]: e.target?.result as string });
      reader.readAsDataURL(file);
    };

    const handleDrop = React.useCallback((e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const imgs = Array.from(e.dataTransfer.files).filter(isImageFile);
      if (imgs.length > 0) processFile(imgs[0]);
    }, []);

    const handlePaste = React.useCallback((e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) { e.preventDefault(); processFile(file); break; }
        }
      }
    }, []);

    React.useEffect(() => {
      document.addEventListener("paste", handlePaste);
      return () => document.removeEventListener("paste", handlePaste);
    }, [handlePaste]);

    const handleSubmit = () => {
      if (!input.trim() && files.length === 0) return;
      const prefix = showSearch ? "[Search] " : showThink ? "[Think] " : showCanvas ? "[Canvas] " : "";
      onSend(prefix + input, files);
      setInput(""); setFiles([]); setFilePreviews({});
    };

    const hasContent = input.trim() !== "" || files.length > 0;

    return (
      <>
        <PromptInput
          ref={(ref as React.RefObject<HTMLDivElement>) || promptBoxRef}
          value={input}
          onValueChange={setInput}
          isLoading={isLoading}
          onSubmit={handleSubmit}
          className={cn("w-full gw-prompt", isRecording && "border-red-500/50", className)}
          disabled={isLoading || isRecording}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleDrop}
        >
          {/* Image attachments */}
          {files.length > 0 && !isRecording && (
            <div className="flex flex-wrap gap-2 px-1 pb-2">
              {files.map((file, i) => (
                filePreviews[file.name] && (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#1E1E2E] cursor-pointer group"
                    onClick={() => setSelectedImage(filePreviews[file.name])}>
                    <img src={filePreviews[file.name]} alt={file.name} className="h-full w-full object-cover" />
                    <button
                      onClick={e => { e.stopPropagation(); setFiles([]); setFilePreviews({}); }}
                      className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Textarea */}
          <div className={cn("transition-all duration-300", isRecording ? "h-0 overflow-hidden opacity-0" : "opacity-100")}>
            <PromptInputTextarea
              placeholder={
                showSearch ? "Search the web for hiring signals…"
                : showThink ? "Think deeply about this search…"
                : showCanvas ? "Create a canvas…"
                : placeholder
              }
            />
          </div>

          {/* Voice recorder */}
          {isRecording && (
            <VoiceRecorder
              isRecording={isRecording}
              onStartRecording={() => console.log("Recording started")}
              onStopRecording={duration => { console.log(`Recorded ${duration}s`); setIsRecording(false); onSend(`[Voice – ${duration}s]`, []); }}
            />
          )}

          {/* Action bar */}
          <PromptInputActions className="justify-between gap-2 px-1 pt-2">
            {/* Left: tools */}
            <div className={cn("flex items-center gap-1 transition-opacity duration-300", isRecording ? "opacity-0 invisible h-0" : "opacity-100 visible")}>
              {/* Attach */}
              <PromptInputAction tooltip="Attach image">
                <button
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                  style={{ color: "#8B8AA8" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#F1F0FF")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#8B8AA8")}
                  disabled={isRecording}
                >
                  <Paperclip className="h-4 w-4" />
                  <input
                    ref={uploadInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]); if (e.target) e.target.value = ""; }}
                  />
                </button>
              </PromptInputAction>

              {/* Mode toggles */}
              <div className="flex items-center">
                <ModeButton active={showSearch} label="Search" activeColor="#06B6D4" activeBg="rgba(6,182,212,0.12)" activeBorder="#06B6D4"
                  icon={<Globe className="w-4 h-4" style={{ color: showSearch ? "#06B6D4" : "inherit" }} />}
                  onClick={() => toggleMode("search")} />
                <CustomDivider />
                <ModeButton active={showThink} label="Think" activeColor="#A78BFA" activeBg="rgba(124,58,237,0.12)" activeBorder="#7C3AED"
                  icon={<BrainCog className="w-4 h-4" style={{ color: showThink ? "#A78BFA" : "inherit" }} />}
                  onClick={() => toggleMode("think")} />
                <CustomDivider />
                <ModeButton active={showCanvas} label="Canvas" activeColor="#F97316" activeBg="rgba(249,115,22,0.12)" activeBorder="#F97316"
                  icon={<FolderCode className="w-4 h-4" style={{ color: showCanvas ? "#F97316" : "inherit" }} />}
                  onClick={() => toggleMode("canvas")} />
              </div>
            </div>

            {/* Right: submit */}
            <PromptInputAction
              tooltip={isLoading ? "Stop" : isRecording ? "Stop recording" : hasContent ? "Send" : "Voice input"}
            >
              <Button
                variant="default"
                size="icon"
                className={cn(
                  "h-8 w-8 rounded-full transition-all duration-200",
                  isRecording
                    ? "bg-transparent text-red-500 hover:text-red-400"
                    : hasContent || isLoading
                    ? "shadow-[0_0_16px_rgba(124,58,237,0.4)]"
                    : "bg-transparent border border-[#1E1E2E] text-[#8B8AA8] hover:text-[#F1F0FF] hover:border-[#7C3AED]/50"
                )}
                style={
                  !isRecording && (hasContent || isLoading)
                    ? { background: "linear-gradient(135deg, #7C3AED, #06B6D4)" }
                    : {}
                }
                onClick={() => {
                  if (isRecording) { setIsRecording(false); }
                  else if (isLoading) { /* stop signal */ }
                  else if (hasContent) { handleSubmit(); }
                  else { setIsRecording(true); }
                }}
              >
                {isLoading ? (
                  <Square className="h-3.5 w-3.5 fill-white animate-pulse" />
                ) : isRecording ? (
                  <StopCircle className="h-5 w-5 text-red-500" />
                ) : hasContent ? (
                  <ArrowUp className="h-4 w-4 text-white" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>

        <ImageViewDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      </>
    );
  }
);
PromptInputBox.displayName = "PromptInputBox";
