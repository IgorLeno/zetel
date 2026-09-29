-- Cor do parceiro (SPEC-002). Aditiva: linhas antigas ficam NULL e recebem
-- cor estável derivada do id na leitura.
ALTER TABLE tutor_profiles ADD COLUMN color TEXT;
