import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBranch } from '@/hooks/useBranch';

export function BranchSelector() {
  const { currentBranch, availableBranches, setCurrentBranch } = useBranch();

  if (!currentBranch || availableBranches.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full gap-2 justify-start">
          <Building2 className="h-4 w-4" />
          {currentBranch.name.replace('Sede ', '')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50 bg-background">
        {availableBranches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => setCurrentBranch(branch)}
            className={currentBranch.id === branch.id ? 'bg-accent' : ''}
          >
            {branch.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
