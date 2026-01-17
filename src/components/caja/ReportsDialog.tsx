import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TransactionsReport } from "./TransactionsReport";
import { ProductsReport } from "./ProductsReport";
import { ServicesReport } from "./ServicesReport";

interface ReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportsDialog({ open, onOpenChange }: ReportsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col min-h-0">
        <DialogHeader>
          <DialogTitle>Reportes de Caja</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="transacciones" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="transacciones">
              Ventas por Transacciones
            </TabsTrigger>
            <TabsTrigger value="productos">
              Ventas por Productos
            </TabsTrigger>
            <TabsTrigger value="servicios">
              Ventas por Servicios
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="transacciones" className="flex-1 min-h-0">
            <TransactionsReport />
          </TabsContent>
          
          <TabsContent value="productos" className="flex-1 min-h-0">
            <ProductsReport />
          </TabsContent>
          
          <TabsContent value="servicios" className="flex-1 min-h-0">
            <ServicesReport />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
