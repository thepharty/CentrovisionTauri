-- Cambiar constraints de invoices para permitir eliminación en cascada de pacientes
ALTER TABLE public.invoices 
DROP CONSTRAINT IF EXISTS invoices_patient_id_fkey,
ADD CONSTRAINT invoices_patient_id_fkey 
  FOREIGN KEY (patient_id) 
  REFERENCES public.patients(id) 
  ON DELETE CASCADE;

-- Cambiar constraints de invoice_items para eliminación en cascada
ALTER TABLE public.invoice_items 
DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey,
ADD CONSTRAINT invoice_items_invoice_id_fkey 
  FOREIGN KEY (invoice_id) 
  REFERENCES public.invoices(id) 
  ON DELETE CASCADE;

-- Cambiar constraints de payments para eliminación en cascada
ALTER TABLE public.payments 
DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey,
ADD CONSTRAINT payments_invoice_id_fkey 
  FOREIGN KEY (invoice_id) 
  REFERENCES public.invoices(id) 
  ON DELETE CASCADE;