import type { NatureEffect, StatKey } from "@/lib/pokemon/types";

export const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];

export const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  atk: "공격",
  def: "방어",
  spa: "특수공격",
  spd: "특수방어",
  spe: "스피드",
};

export const ROLE_LABELS: Record<string, string> = {
  sweeper: "스위퍼",
  "bulky-sweeper": "내구 스위퍼",
  wall: "월",
  support: "서포터",
  "speed-control": "스피드 컨트롤",
};

export const TYPE_LABELS_KO: Record<string, string> = {
  Normal: "노말",
  Fire: "불꽃",
  Water: "물",
  Electric: "전기",
  Grass: "풀",
  Ice: "얼음",
  Fighting: "격투",
  Poison: "독",
  Ground: "땅",
  Flying: "비행",
  Psychic: "에스퍼",
  Bug: "벌레",
  Rock: "바위",
  Ghost: "고스트",
  Dragon: "드래곤",
  Dark: "악",
  Steel: "강철",
  Fairy: "페어리",
};

export const NATURES: NatureEffect[] = [
  { name: "Hardy", labelKo: "노력", increase: null, decrease: null },
  { name: "Lonely", labelKo: "외로움", increase: "atk", decrease: "def" },
  { name: "Brave", labelKo: "용감", increase: "atk", decrease: "spe" },
  { name: "Adamant", labelKo: "고집", increase: "atk", decrease: "spa" },
  { name: "Naughty", labelKo: "개구쟁이", increase: "atk", decrease: "spd" },
  { name: "Bold", labelKo: "대담", increase: "def", decrease: "atk" },
  { name: "Docile", labelKo: "온순", increase: null, decrease: null },
  { name: "Relaxed", labelKo: "무사태평", increase: "def", decrease: "spe" },
  { name: "Impish", labelKo: "장난꾸러기", increase: "def", decrease: "spa" },
  { name: "Lax", labelKo: "촐랑", increase: "def", decrease: "spd" },
  { name: "Timid", labelKo: "겁쟁이", increase: "spe", decrease: "atk" },
  { name: "Hasty", labelKo: "성급", increase: "spe", decrease: "def" },
  { name: "Serious", labelKo: "성실", increase: null, decrease: null },
  { name: "Jolly", labelKo: "명랑", increase: "spe", decrease: "spa" },
  { name: "Naive", labelKo: "천진난만", increase: "spe", decrease: "spd" },
  { name: "Modest", labelKo: "조심", increase: "spa", decrease: "atk" },
  { name: "Mild", labelKo: "의젓", increase: "spa", decrease: "def" },
  { name: "Quiet", labelKo: "냉정", increase: "spa", decrease: "spe" },
  { name: "Bashful", labelKo: "수줍음", increase: null, decrease: null },
  { name: "Rash", labelKo: "덜렁", increase: "spa", decrease: "spd" },
  { name: "Calm", labelKo: "차분", increase: "spd", decrease: "atk" },
  { name: "Gentle", labelKo: "얌전", increase: "spd", decrease: "def" },
  { name: "Sassy", labelKo: "건방", increase: "spd", decrease: "spe" },
  { name: "Careful", labelKo: "신중", increase: "spd", decrease: "spa" },
  { name: "Quirky", labelKo: "변덕", increase: null, decrease: null },
];

export const ROLE_HINTS: Record<string, string[]> = {
  sweeper: ["스피드 기준점 확인", "핵심 화력 스탯 극대화"],
  "bulky-sweeper": ["화력과 내구 밸런스", "핵심 매치업 생존 계산"],
  wall: ["회복 수단 확보", "물리/특수 대응 방향 설정"],
  support: ["상태이상 운영 플랜", "팀 시너지와 교체 턴 설계"],
  "speed-control": ["스피드 제어 안정성", "구애 아이템 리스크 관리"],
};
