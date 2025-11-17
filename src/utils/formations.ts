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
      { id: "LCB", label: "LCB", x: 38, y: 78 },
      { id: "RCB", label: "RCB", x: 62, y: 78 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LCM", label: "LCM", x: 36, y: 54 },
      { id: "CAM", label: "CAM", x: 50, y: 40 },
      { id: "RCM", label: "RCM", x: 64, y: 54 },
      { id: "LW", label: "LW", x: 18, y: 24 },
      { id: "ST", label: "ST", x: 50, y: 12 },
      { id: "RW", label: "RW", x: 82, y: 24 }
    ]
  },
  {
    code: "433-cdm",
    label: "4-3-3 (CM, CM, CDM)",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 78 },
      { id: "RCB", label: "RCB", x: 62, y: 78 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LCM", label: "LCM", x: 36, y: 50 },
      { id: "CDM", label: "CDM", x: 50, y: 62 },
      { id: "RCM", label: "RCM", x: 64, y: 50 },
      { id: "LW", label: "LW", x: 18, y: 24 },
      { id: "ST", label: "ST", x: 50, y: 12 },
      { id: "RW", label: "RW", x: 82, y: 24 }
    ]
  },
  {
    code: "442",
    label: "4-4-2",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 78 },
      { id: "RCB", label: "RCB", x: 62, y: 78 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LM", label: "LM", x: 18, y: 34 },
      { id: "LCM", label: "LCM", x: 40, y: 54 },
      { id: "RCM", label: "RCM", x: 60, y: 54 },
      { id: "RM", label: "RM", x: 82, y: 34 },
      { id: "STL", label: "ST", x: 44, y: 14 },
      { id: "STR", label: "CF", x: 56, y: 14 }
    ]
  },
  {
    code: "4231",
    label: "4-2-3-1",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LB", label: "LB", x: 18, y: 82 },
      { id: "LCB", label: "LCB", x: 38, y: 78 },
      { id: "RCB", label: "RCB", x: 62, y: 78 },
      { id: "RB", label: "RB", x: 82, y: 82 },
      { id: "LCDM", label: "CDM", x: 40, y: 58 },
      { id: "RCDM", label: "CDM", x: 60, y: 58 },
      { id: "LW", label: "LW", x: 18, y: 24 },
      { id: "CAM", label: "CAM", x: 50, y: 36 },
      { id: "RW", label: "RW", x: 82, y: 24 },
      { id: "ST", label: "ST", x: 50, y: 12 }
    ]
  },
  {
    code: "343",
    label: "3-4-3",
    slots: [
      { id: "GK", label: "GK", x: 50, y: 94 },
      { id: "LCB", label: "LCB", x: 34, y: 78 },
      { id: "CB", label: "CB", x: 50, y: 76 },
      { id: "RCB", label: "RCB", x: 66, y: 78 },
      { id: "LWB", label: "LWB", x: 18, y: 46 },
      { id: "LCM", label: "CM", x: 40, y: 54 },
      { id: "RCM", label: "CM", x: 60, y: 54 },
      { id: "RWB", label: "RWB", x: 82, y: 46 },
      { id: "LW", label: "LW", x: 18, y: 24 },
      { id: "CF", label: "CF", x: 50, y: 12 },
      { id: "RW", label: "RW", x: 82, y: 24 }
    ]
  }
];

export const getFormationByCode = (code: string) =>
  SOCCER_FORMATIONS.find((formation) => formation.code === code) ?? null;
