/** 平台预设校区，发布书籍与求购单共用，保证校区字符串一致才能互相匹配 */
export const campuses = ['主校区', '东校区', '西校区', '南校区', '北校区'];

export const campusOptions = campuses.map((c) => ({ text: c, value: c }));
