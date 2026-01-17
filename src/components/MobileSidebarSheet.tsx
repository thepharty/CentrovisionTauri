import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface MobileSidebarSheetProps {
  children: React.ReactNode;
  title?: string;
}

export function MobileSidebarSheet({ children, title = "Historial del Paciente" }: MobileSidebarSheetProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="lg:hidden fixed left-0 top-1/2 -translate-y-1/2 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="default" 
            size="sm" 
            className="rounded-l-none rounded-r-lg shadow-lg h-12 px-2"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="p-4">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
