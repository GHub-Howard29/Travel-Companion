declare module "lunar-javascript" {
  interface LunarDate {
    getYearInGanZhi(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
  }

  interface SolarDate {
    getLunar(): LunarDate;
  }

  export const Solar: {
    fromYmd(year: number, month: number, day: number): SolarDate;
  };
}
