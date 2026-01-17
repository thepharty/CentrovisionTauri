-- Add specialty column to profiles table for doctor subspecialties
ALTER TABLE public.profiles 
ADD COLUMN specialty text;