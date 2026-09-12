import React from 'react';

export interface SimulationDrawerProps {
  open?: boolean;
  onClose?: () => void;
  activeMenuKey?: string;
  onSimulateScan?: (type: string) => void;
}

export const SimulationDrawer: React.FC<SimulationDrawerProps> = () => {
  return null;
};
