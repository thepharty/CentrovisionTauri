-- Eliminar la restricción única en service_type para permitir múltiples servicios del mismo tipo
ALTER TABLE public.service_prices DROP CONSTRAINT IF EXISTS service_prices_service_type_key;

-- Insertar servicios de ejemplo
INSERT INTO public.service_prices (service_type, service_name, price, active) VALUES
-- Consultas
('consulta', 'Consulta General', 200.00, true),
('consulta', 'Consulta Especializada', 350.00, true),
('consulta', 'Reconsulta', 150.00, true),

-- Estudios
('estudio', 'Tomografía de Coherencia Óptica (OCT)', 450.00, true),
('estudio', 'Campo Visual', 300.00, true),
('estudio', 'Topografía Corneal', 350.00, true),
('estudio', 'Biometría', 250.00, true),

-- Procedimientos
('procedimiento', 'Inyección Intravítrea', 800.00, true),
('procedimiento', 'Láser YAG', 600.00, true),
('procedimiento', 'Láser Argón', 650.00, true),

-- Cirugías
('cirugia', 'Cirugía de Catarata con LIO', 12000.00, true),
('cirugia', 'Cirugía de Pterigión', 8000.00, true),
('cirugia', 'Vitrectomía', 15000.00, true);

-- Insertar productos de ejemplo en inventory_items
INSERT INTO public.inventory_items (code, name, category, unit_price, current_stock, min_stock, requires_lot, active, notes) VALUES
-- Medicamentos/Gotas
('MED-001', 'Vigamox Gotas Oftálmicas', 'gota', 85.00, 20, 5, true, true, 'Antibiótico oftálmico'),
('MED-002', 'Pred Forte 1%', 'gota', 95.00, 15, 5, true, true, 'Corticoide oftálmico'),
('MED-003', 'Timolol 0.5%', 'gota', 45.00, 25, 5, true, true, 'Antiglaucomatoso'),
('MED-004', 'Dorzolamida + Timolol', 'gota', 120.00, 10, 3, true, true, 'Combinación antiglaucomatosa'),

-- Lentes de contacto
('LC-001', 'Lentes de Contacto Blandos -2.00', 'lente', 250.00, 10, 2, false, true, 'Miopía baja'),
('LC-002', 'Lentes de Contacto Blandos -3.50', 'lente', 250.00, 8, 2, false, true, 'Miopía moderada'),
('LC-003', 'Lentes de Contacto Tóricos', 'lente', 350.00, 5, 2, false, true, 'Para astigmatismo'),

-- Accesorios
('ACC-001', 'Estuche para lentes', 'accesorio', 15.00, 50, 10, false, true, 'Estuche rígido'),
('ACC-002', 'Solución limpiadora 360ml', 'accesorio', 65.00, 30, 5, false, true, 'Solución multifunción'),
('ACC-003', 'Paño de microfibra', 'accesorio', 10.00, 100, 20, false, true, 'Para limpieza de lentes');