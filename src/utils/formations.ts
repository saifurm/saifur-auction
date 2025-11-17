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
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 80 },
      { id: "RCB", label: "RCB", x: 62, y: 80 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LCM", label: "LCM", x: 34, y: 62 },
      { id: "CAM", label: "CAM", x: 50, y: 48 },
      { id: "RCM", label: "RCM", x: 66, y: 62 },
      { id: "LW", label: "LW", x: 18, y: 32 },
      { id: "ST", label: "ST", x: 50, y: 18 },
      { id: "RW", label: "RW", x: 82, y: 32 }
    ]
  },
  {
    code: "433-cdm",
    label: "4-3-3 (CM, CM, CDM)",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 80 },
      { id: "RCB", label: "RCB", x: 62, y: 80 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LCM", label: "LCM", x: 34, y: 58 },
      { id: "CDM", label: "CDM", x: 50, y: 68 },
      { id: "RCM", label: "RCM", x: 66, y: 58 },
      { id: "LW", label: "LW", x: 18, y: 32 },
      { id: "ST", label: "ST", x: 50, y: 18 },
      { id: "RW", label: "RW", x: 82, y: 32 }
    ]
  },
  {
    code: "442",
    label: "4-4-2",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 80 },
      { id: "RCB", label: "RCB", x: 62, y: 80 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LM", label: "LM", x: 18, y: 42 },
      { id: "LCM", label: "LCM", x: 40, y: 58 },
      { id: "RCM", label: "RCM", x: 60, y: 58 },
      { id: "RM", label: "RM", x: 82, y: 42 },
      { id: "STL", label: "ST", x: 42, y: 20 },
      { id: "STR", label: "CF", x: 58, y: 20 }
    ]
  },
  {
    code: "4231",
    label: "4-2-3-1",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 80 },
      { id: "RCB", label: "RCB", x: 62, y: 80 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LCDM", label: "CDM", x: 40, y: 64 },
      { id: "RCDM", label: "CDM", x: 60, y: 64 },
      { id: "LW", label: "LW", x: 18, y: 34 },
      { id: "CAM", label: "CAM", x: 50, y: 46 },
      { id: "RW", label: "RW", x: 82, y: 34 },
      { id: "ST", label: "ST", x: 50, y: 18 }
    ]
  },
  {
    code: "343",
    label: "3-4-3",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LCB", label: "LCB", x: 32, y: 80 },
      { id: "CB", label: "CB", x: 50, y: 78 },
      { id: "RCB", label: "RCB", x: 68, y: 80 },
      { id: "LWB", label: "LWB", x: 20, y: 58 },
      { id: "LCM", label: "CM", x: 40, y: 58 },
      { id: "RCM", label: "CM", x: 60, y: 58 },
      { id: "RWB", label: "RWB", x: 80, y: 58 },
      { id: "LW", label: "LW", x: 18, y: 32 },
      { id: "CF", label: "CF", x: 50, y: 18 },
      { id: "RW", label: "RW", x: 82, y: 32 }
    ]
  }
];

export const getFormationByCode = (code: string) =>
  SOCCER_FORMATIONS.find((formation) => formation.code === code) ?? null;
