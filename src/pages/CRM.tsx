import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Search, LayoutGrid, List, RefreshCw } from 'lucide-react';
import { useCRMPipelines } from '@/hooks/useCRMPipelines';
import { useCRMProcedureTypes } from '@/hooks/useCRMProcedureTypes';
import { useBranch } from '@/hooks/useBranch';
import { useAuth } from '@/hooks/useAuth';
import { KanbanBoard } from '@/components/crm/KanbanBoard';
import { PipelineListView } from '@/components/crm/PipelineListView';
import { NewPipelineDialog } from '@/components/crm/NewPipelineDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCRMNotifications } from '@/hooks/useCRMNotifications';
import { ActivityPanel } from '@/components/crm/ActivityPanel';
import { FLOW_CATEGORIES, FlowCategory } from '@/lib/crmStages';
import { cn } from '@/lib/utils';

const CRM = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { currentBranch } = useBranch();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [procedureFilter, setProcedureFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('activo');
  const [flowCategory, setFlowCategory] = useState<FlowCategory>('surgeries');

  const { data: pipelines, isLoading: pipelinesLoading, refetch } = useCRMPipelines(currentBranch?.id || undefined);
  const { data: procedureTypes, isLoading: typesLoading } = useCRMProcedureTypes();
  const { 
    recentActivities, 
    getFilteredActivities,
    isLoadingActivities, 
    lastRead, 
    markAsRead, 
    unreadCountSurgeries, 
    unreadCountSupplies 
  } = useCRMNotifications();

  // Mark category as read when switching
  const handleCategoryChange = (category: FlowCategory) => {
    setFlowCategory(category);
    markAsRead(); // Mark current notifications as read when viewing category
  };

  const isLoading = pipelinesLoading || typesLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">CRM Cirugías</h1>
                <p className="text-sm text-muted-foreground">
                  Gestión de pipelines quirúrgicos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <NewPipelineDialog />
            </div>
          </div>
        </div>
      </header>

      {/* Category Selector */}
      <div className="container mx-auto px-4 pt-4">
        <div className="flex justify-center">
          <div className="inline-flex rounded-lg border bg-muted p-1 gap-1">
            <Button
              variant={flowCategory === 'surgeries' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleCategoryChange('surgeries')}
              className={cn(
                "relative px-8",
                flowCategory !== 'surgeries' && "text-muted-foreground"
              )}
            >
              {FLOW_CATEGORIES.surgeries.label}
              {flowCategory !== 'surgeries' && unreadCountSurgeries > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1 font-medium">
                  {unreadCountSurgeries > 9 ? '9+' : unreadCountSurgeries}
                </span>
              )}
            </Button>
            <Button
              variant={flowCategory === 'supplies' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleCategoryChange('supplies')}
              className={cn(
                "relative px-8",
                flowCategory !== 'supplies' && "text-muted-foreground"
              )}
            >
              {FLOW_CATEGORIES.supplies.label}
              {flowCategory !== 'supplies' && unreadCountSupplies > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full h-5 min-w-5 flex items-center justify-center px-1 font-medium">
                  {unreadCountSupplies > 9 ? '9+' : unreadCountSupplies}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Procedure Filter */}
          <Select value={procedureFilter} onValueChange={setProcedureFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Procedimiento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los procedimientos</SelectItem>
              {procedureTypes?.map((type) => (
                <SelectItem key={type.id} value={type.name}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter (only for list view) */}
          {viewMode === 'list' && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="completado">Completados</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* View Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'kanban' | 'list')}>
            <TabsList>
              <TabsTrigger value="kanban" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                Lista
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-8">
        {/* Activity Panel - Filtered by category */}
        <ActivityPanel 
          activities={getFilteredActivities(flowCategory)} 
          isLoading={isLoadingActivities} 
          lastRead={lastRead}
          onMarkAsRead={markAsRead}
        />
        
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-[400px] w-[280px] rounded-lg" />
              ))}
            </div>
          </div>
        ) : viewMode === 'kanban' ? (
          <KanbanBoard
            pipelines={pipelines || []}
            procedureFilter={procedureFilter}
            searchQuery={searchQuery}
            flowCategory={flowCategory}
          />
        ) : (
          <PipelineListView
            pipelines={pipelines || []}
            procedureFilter={procedureFilter}
            searchQuery={searchQuery}
            statusFilter={statusFilter}
            flowCategory={flowCategory}
          />
        )}
      </div>
    </div>
  );
};

export default CRM;
