export interface FormationSlot {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface SoccerFormation {
  code: string;
  label: string;
  slots: FormationSlot[];
}

export const SOCCER_FORMATIONS: SoccerFormation[] = [
  {
    code: "433-cam",
    label: "4-3-3 (CAM, CM, CM)",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 92 },
      { id: "LB", label: "LB", x: 15, y: 80 },
      { id: "LCB", label: "LCB", x: 35, y: 78 },
      { id: "RCB", label: "RCB", x: 65, y: 78 },
      { id: "RB", label: "RB", x: 85, y: 80 },
      { id: "LCM", label: "LCM", x: 32, y: 60 },
      { id: "CAM", label: "CAM", x: 50, y: 52 },
      { id: "RCM", label: "RCM", x: 68, y: 60 },
      { id: "LW", label: "LW", x: 25, y: 32 },
      { id: "ST", label: "ST", x: 50, y: 22 },
      { id: "RW", label: "RW", x: 75, y: 32 }
    ]
  },
  {
    code: "433-cdm",
    label: "4-3-3 (CM, CM, CDM)",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 92 },
      { id: "LB", label: "LB", x: 15, y: 80 },
      { id: "LCB", label: "LCB", x: 35, y: 78 },
      { id: "RCB", label: "RCB", x: 65, y: 78 },
      { id: "RB", label: "RB", x: 85, y: 80 },
      { id: "LCM", label: "LCM", x: 32, y: 58 },
      { id: "CDM", label: "CDM", x: 50, y: 68 },
      { id: "RCM", label: "RCM", x: 68, y: 58 },
      { id: "LW", label: "LW", x: 25, y: 32 },
      { id: "ST", label: "ST", x: 50, y: 22 },
      { id: "RW", label: "RW", x: 75, y: 32 }
    ]
  },
  {
    code: "442",
    label: "4-4-2",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 92 },
      { id: "LB", label: "LB", x: 15, y: 80 },
      { id: "LCB", label: "LCB", x: 35, y: 78 },
      { id: "RCB", label: "RCB", x: 65, y: 78 },
      { id: "RB", label: "RB", x: 85, y: 80 },
      { id: "LM", label: "LM", x: 22, y: 55 },
      { id: "LCM", label: "LCM", x: 40, y: 58 },
      { id: "RCM", label: "RCM", x: 60, y: 58 },
      { id: "RM", label: "RM", x: 78, y: 55 },
      { id: "STL", label: "LS", x: 42, y: 28 },
      { id: "STR", label: "RS", x: 58, y: 28 }
    ]
  },
  {
    code: "4231",
    label: "4-2-3-1",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 92 },
      { id: "LB", label: "LB", x: 15, y: 80 },
      { id: "LCB", label: "LCB", x: 35, y: 78 },
      { id: "RCB", label: "RCB", x: 65, y: 78 },
      { id: "RB", label: "RB", x: 85, y: 80 },
      { id: "LCDM", label: "CDM", x: 40, y: 66 },
      { id: "RCDM", label: "CDM", x: 60, y: 66 },
      { id: "LW", label: "LW", x: 25, y: 40 },
      { id: "CAM", label: "CAM", x: 50, y: 46 },
      { id: "RW", label: "RW", x: 75, y: 40 },
      { id: "ST", label: "ST", x: 50, y: 25 }
    ]
  },
  {
    code: "343",
    label: "3-4-3",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 92 },
      { id: "LCB", label: "LCB", x: 30, y: 78 },
      { id: "CB", label: "CB", x: 50, y: 78 },
      { id: "RCB", label: "RCB", x: 70, y: 78 },
      { id: "LWB", label: "LWB", x: 20, y: 58 },
      { id: "LCM", label: "CM", x: 40, y: 56 },
      { id: "RCM", label: "CM", x: 60, y: 56 },
      { id: "RWB", label: "RWB", x: 80, y: 58 },
      { id: "LW", label: "LW", x: 30, y: 32 },
      { id: "CF", label: "CF", x: 50, y: 24 },
      { id: "RW", label: "RW", x: 70, y: 32 }
    ]
  }
];

export const getFormationByCode = (code: string) =>
  SOCCER_FORMATIONS.find((formation) => formation.code === code) ?? null;
