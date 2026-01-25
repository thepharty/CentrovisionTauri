import { useEffect, useState, useCallback } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Download, RefreshCw, X } from "lucide-react";

interface UpdateState {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  error: string | null;
  update: Update | null;
}

export function UpdateChecker() {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    error: null,
    update: null,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const checkForUpdates = useCallback(async (showNoUpdateToast = false) => {
    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      const update = await check();

      if (update) {
        setState((prev) => ({
          ...prev,
          checking: false,
          available: true,
          update,
        }));
        setDialogOpen(true);
      } else {
        setState((prev) => ({ ...prev, checking: false, available: false }));
        if (showNoUpdateToast) {
          toast.info("No hay actualizaciones disponibles", {
            description: "Ya tienes la ultima version instalada.",
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      setState((prev) => ({
        ...prev,
        checking: false,
        error: errorMessage,
      }));
      console.error("Error checking for updates:", error);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!state.update) return;

    setState((prev) => ({ ...prev, downloading: true, progress: 0 }));

    try {
      let downloadedBytes = 0;
      let totalBytes = 0;

      await state.update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength || 0;
            console.log(`Download started, total: ${totalBytes} bytes`);
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            const progress = totalBytes > 0
              ? Math.round((downloadedBytes / totalBytes) * 100)
              : 0;
            setState((prev) => ({ ...prev, progress }));
            break;
          case "Finished":
            console.log("Download finished");
            setState((prev) => ({
              ...prev,
              downloading: false,
              downloaded: true,
              progress: 100
            }));
            break;
        }
      });

      toast.success("Actualizacion instalada", {
        description: "La aplicacion se reiniciara en 3 segundos...",
      });

      setTimeout(async () => {
        await relaunch();
      }, 3000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      setState((prev) => ({
        ...prev,
        downloading: false,
        error: errorMessage,
      }));
      toast.error("Error al actualizar", {
        description: errorMessage,
      });
    }
  }, [state.update]);

  const dismissUpdate = useCallback(() => {
    setDialogOpen(false);
    localStorage.setItem(
      "dismissedUpdate",
      JSON.stringify({
        version: state.update?.version,
        timestamp: Date.now(),
      })
    );
  }, [state.update]);

  // Verificar actualizaciones al iniciar (con delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      const dismissed = localStorage.getItem("dismissedUpdate");
      if (dismissed) {
        try {
          const { timestamp } = JSON.parse(dismissed);
          const hoursSinceDismissed = (Date.now() - timestamp) / (1000 * 60 * 60);
          if (hoursSinceDismissed < 24) {
            return;
          }
        } catch {
          // Si hay error parseando, verificar de todos modos
        }
      }
      checkForUpdates(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [checkForUpdates]);

  // Verificar periodicamente (cada 4 horas)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.downloading && !state.downloaded) {
        checkForUpdates(false);
      }
    }, 4 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [checkForUpdates, state.downloading, state.downloaded]);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Actualizacion Disponible
          </DialogTitle>
          <DialogDescription>
            {state.update && (
              <>
                Una nueva version de CentroVision EHR esta disponible.
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="font-medium">
                    Version {state.update.version}
                  </p>
                  {state.update.body && (
                    <p className="text-sm mt-1 text-muted-foreground whitespace-pre-wrap">
                      {state.update.body}
                    </p>
                  )}
                </div>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {state.downloading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Descargando actualizacion...</span>
              <span>{state.progress}%</span>
            </div>
            <Progress value={state.progress} className="h-2" />
          </div>
        )}

        {state.downloaded && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Instalando y reiniciando...
          </div>
        )}

        {state.error && (
          <div className="text-sm text-destructive">
            Error: {state.error}
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:gap-0">
          {!state.downloading && !state.downloaded && (
            <>
              <Button
                variant="outline"
                onClick={dismissUpdate}
                disabled={state.downloading}
              >
                <X className="h-4 w-4 mr-2" />
                Mas tarde
              </Button>
              <Button
                onClick={downloadAndInstall}
                disabled={state.downloading}
              >
                <Download className="h-4 w-4 mr-2" />
                Actualizar ahora
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
