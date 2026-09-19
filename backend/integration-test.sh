#!/usr/bin/env bash
# 教材同版匹配闭环 端到端集成测试
# 依赖：运行中的后端 http://127.0.0.1:3000 与种子数据
set -uo pipefail
BASE=http://127.0.0.1:3000/api
PASS=0; FAIL=0
ok(){   echo "  ✅ $*"; PASS=$((PASS+1)); }
bad(){  echo "  ❌ $*"; FAIL=$((FAIL+1)); }
check(){ # check <desc> <expected> <actual>
  if [ "$2" == "$3" ]; then ok "$1 (=$3)"; else bad "$1: 期望[$2] 实际[$3]"; fi
}
api(){ # api <method> <path> [token] [json]
  local m=$1 p=$2 t=${3:-} body=${4:-} out
  if [ -n "$body" ]; then
    out=$(curl -s -X "$m" "$BASE$p" -H 'Content-Type: application/json' ${t:+-H "Authorization: Bearer $t"} -d "$body")
  else
    out=$(curl -s -X "$m" "$BASE$p" ${t:+-H "Authorization: Bearer $t"})
  fi
  echo "$out"
}
code(){ # http code only: api_code <method> <path> [token] [json]
  local m=$1 p=$2 t=${3:-} body=${4:-}
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$BASE$p" -H 'Content-Type: application/json' ${t:+-H "Authorization: Bearer $t"} -d "$body"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$BASE$p" ${t:+-H "Authorization: Bearer $t"}
  fi
}

# 读取种子输出
SEED=$(sed -n '/^{/,$p' /tmp/seed.out)
TB(){ echo "$SEED" | jq -r "$1"; }
BTOK=$(TB '.buyer.token'); B2TOK=$(TB '.buyer2.token'); STOK=$(TB '.seller.token'); S2TOK=$(TB '.seller2.token')
BOOKA=$(TB '.bookA'); BOOKB=$(TB '.bookB'); BOOKC=$(TB '.bookC')
PRICY=$(TB '.bookPricy'); ED=$(TB '.bookEdition'); CAMP=$(TB '.bookCampus'); COURSE=$(TB '.bookCourse')
OWN=$(TB '.ownBook'); SOLD=$(TB '.soldBook')
REQ=$(TB '.reqMain'); REQ2=$(TB '.reqSecond'); REQNP=$(TB '.reqNoPrice'); REQOE=$(TB '.reqOtherEdition')

echo "================ 1. 求购列表剩余候选数 ================"
L=$(api GET /purchase-requests "$BTOK")
getcnt(){ echo "$L" | jq -r --arg id "$1" '.requests[]|select(.id==$id)|.candidateCount'; }
check "主求购(CS101第2版主校区)候选数=4(20/28/30/99，排除自己&已售)" 4 "$(getcnt $REQ)"
check "次求购候选数=5(含买家1自己的书)" 5 "$(getcnt $REQ2)"
check "无价格限制求购候选数=5" 5 "$(getcnt $REQNP)"
check "第3版求购候选数=1(仅版次匹配的bookEdition)" 1 "$(getcnt $REQOE)"

echo "================ 2. 书籍列表匹配求购数 ================"
BL=$(api GET "/books?limit=50")
rc(){ echo "$BL" | jq -r --arg id "$1" '.books[]|select(.id==$id)|.matchedRequestCount'; }
# CS101 第2版 主校区的活跃求购: reqMain(买家1), reqSecond(买家2), reqNoPrice(买家2)=3
check "bookA 对应求购数=3" 3 "$(rc $BOOKA)"
check "bookPricy 对应求购数=3" 3 "$(rc $PRICY)"
check "bookEdition(第3版) 对应求购数=1" 1 "$(rc $ED)"
check "bookCampus(东校区) 对应求购数=0" 0 "$(rc $CAMP)"
check "bookCourse(CS202) 对应求购数=0" 0 "$(rc $COURSE)"
check "ownBook 对应求购数(卖家=买家1，排除其自己)=2" 2 "$(rc $OWN)"

echo "================ 3. 求购单详情：候选书 & 匹配原因 ================"
D=$(api GET "/purchase-requests/$REQ" "$BTOK")
echo "$D" | jq -r '.candidateBooks[].id' | sort > /tmp/cand.txt
echo -e "$BOOKA\n$BOOKB\n$BOOKC\n$PRICY" | sort > /tmp/expect_cand.txt
if diff -q /tmp/cand.txt /tmp/expect_cand.txt >/dev/null; then ok "候选书恰为 A/B/C/Pricy（含期望价软提示但不剔除）"; else bad "候选书集合不符:"; cat /tmp/cand.txt; fi
check "详情候选数=4" 4 "$(echo "$D" | jq -r '.candidateCount')"
check "尚无进行中交易" null "$(echo "$D" | jq -r '.pendingTrade')"
# 候选不应包含自己的书 / 已售书 / 不匹配书
for x in "$OWN" "$SOLD" "$ED" "$CAMP" "$COURSE"; do
  if echo "$D" | jq -e --arg id "$x" '.candidateBooks[]|select(.id==$id)' >/dev/null; then bad "候选不应包含 $x"; else ok "候选正确排除 $x"; fi
done

echo "---- 书籍详情匹配原因（从求购单跳转）----"
BD=$(api GET "/books/$BOOKA?requestId=$REQ")
check "匹配书 matched=true" true "$(echo "$BD" | jq -r '.matchReason.matched')"
check "  校区命中" true "$(echo "$BD" | jq -r '.matchReason.campus')"
check "  课程代码命中" true "$(echo "$BD" | jq -r '.matchReason.courseCode')"
check "  版次命中" true "$(echo "$BD" | jq -r '.matchReason.edition')"
EDB=$(api GET "/books/$ED?requestId=$REQ")
check "版次不一致 matched=false" false "$(echo "$EDB" | jq -r '.matchReason.matched')"
check "  版次标记为不匹配" false "$(echo "$EDB" | jq -r '.matchReason.edition')"
check "  课程代码仍命中" true "$(echo "$EDB" | jq -r '.matchReason.courseCode')"

echo "================ 4. 仅同版可预约：硬性条件校验 ================"
check "预约版次不一致被拒(400)" 400 "$(code POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$ED\"}")"
check "预约校区不一致被拒(400)" 400 "$(code POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$CAMP\"}")"
check "预约课程代码不一致被拒(400)" 400 "$(code POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$COURSE\"}")"
check "预约自己的书被拒(400)" 400 "$(code POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$OWN\"}")"
check "预约已售出被拒(409)" 409 "$(code POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$SOLD\"}")"
check "为他人求购单预约被拒(403)" 403 "$(code POST "/purchase-requests/$REQ2/select" "$BTOK" "{\"bookId\":\"$BOOKA\"}")"
check "未认证被拒(401)" 401 "$(code POST "/purchase-requests/$REQ/select" "" "{\"bookId\":\"$BOOKA\"}")"

echo "================ 5. 正常预约：生成交易 + 书锁定 ================"
SEL=$(api POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$BOOKA\"}")
check "首次预约返回 201/成功提示" "预约成功，已生成交易记录" "$(echo "$SEL" | jq -r '.message')"
check "alreadySelected=false" false "$(echo "$SEL" | jq -r '.alreadySelected')"
TRADE=$(echo "$SEL" | jq -r '.trade.id')
[ -n "$TRADE" ] && [ "$TRADE" != null ] && ok "生成交易记录 id=$TRADE" || bad "未生成交易记录"
check "交易状态=pending" pending "$(echo "$SEL" | jq -r '.trade.status')"
check "交易价格=书价20" 20 "$(echo "$SEL" | jq -r '.trade.price|tonumber')"
# 书状态
check "书A变为 reserved" reserved "$(api GET "/books/$BOOKA" | jq -r '.status')"
# 书A不再是任何求购单候选（可购买列表）
D2=$(api GET "/purchase-requests/$REQ2" "$B2TOK")
if echo "$D2" | jq -e --arg id "$BOOKA" '.candidateBooks[]|select(.id==$id)' >/dev/null; then bad "已预约书不应再是候选"; else ok "已预约书A从其他求购单候选中消失"; fi
# 此时仅 bookA 被预约（bookB 的并发抢占在下一步）。买家2候选初始5(含买家1的ownBook)，故 5->4
check "次求购候选数降为4" 4 "$(echo "$D2" | jq -r '.candidateCount')"
# 书籍A的求购数仍计活跃求购(3)（详情接口无视状态都计算）
check "书籍A的求购数仍计活跃求购(3)" 3 "$(api GET "/books/$BOOKA" | jq -r '.matchedRequestCount')"

echo "================ 6. 重复选择幂等 ================"
SEL2=$(api POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$BOOKA\"}")
check "重复选同一本 alreadySelected=true" true "$(echo "$SEL2" | jq -r '.alreadySelected')"
check "返回同一笔交易" "$TRADE" "$(echo "$SEL2" | jq -r '.trade.id')"
check "仍只有一笔pending交易(trade记录数=1)" 1 "$(M2=/tmp/mysqlportable/mysql/bin/mysql; $M2 -h127.0.0.1 -uroot campus_bookstore -N -e "SELECT COUNT(*) FROM trades WHERE bookId='$BOOKA' AND status='pending';")"

echo "================ 7. 并发抢同一本书只能成功一次 ================"
# 买家2 对次求购单抢 bookB，同时发起 6 个并发请求
: > /tmp/concurrent_codes.txt
for i in 1 2 3 4 5 6; do
  rm -f /tmp/cc_$i.out
  curl -s -o /tmp/cc_$i.out -w '%{http_code}\n' -X POST "$BASE/purchase-requests/$REQ2/select" \
    -H "Authorization: Bearer $B2TOK" -H 'Content-Type: application/json' \
    -d "{\"bookId\":\"$BOOKB\"}" >> /tmp/concurrent_codes.txt &
done
wait
SUCCESS=$(grep -c '^201$' /tmp/concurrent_codes.txt || true)
IDEMPOTENT=$(grep -c '^200$' /tmp/concurrent_codes.txt || true)
CONFLICT=$(grep -c '^409$' /tmp/concurrent_codes.txt || true)
echo "     并发结果分布: 201=$SUCCESS 200(幂等)=$IDEMPOTENT 409(冲突)=$CONFLICT"
check "并发6次：恰好1次201(真正创建)" 1 "$SUCCESS"
check "并发6次：其余5次均为200或409(未重复创建)" 5 "$((IDEMPOTENT+CONFLICT))"
check "并发6次：无其他异常码" 0 "$(grep -vcE '^(201|200|409)$' /tmp/concurrent_codes.txt || true)"
# 所有成功/幂等响应必须指向同一笔交易
SAME=$(cat /tmp/cc_*.out | jq -r 'select(.trade!=null)|.trade.id' | sort -u | wc -l | tr -d ' ')
check "所有成功响应指向同一笔交易" 1 "$SAME"
T2=$(M2=/tmp/mysqlportable/mysql/bin/mysql; $M2 -h127.0.0.1 -uroot campus_bookstore -N -e "SELECT COUNT(*) FROM trades WHERE bookId='$BOOKB';")
check "bookB 总共只有1条交易" 1 "$T2"
check "bookB 状态=reserved" reserved "$(api GET "/books/$BOOKB" | jq -r '.status')"

echo "================ 8. 刷新后状态一致 ================"
D3=$(api GET "/purchase-requests/$REQ" "$BTOK")
check "主求购详情 pendingTrade.bookId=bookA" "$BOOKA" "$(echo "$D3" | jq -r '.pendingTrade.bookId')"
check "主求购候选数降为2(bookA已预约，买家1候选初始4)" 2 "$(echo "$D3" | jq -r '.candidateCount')"
D4=$(api GET "/purchase-requests/$REQ2" "$B2TOK")
check "次求购 pendingTrade.bookId=bookB" "$BOOKB" "$(echo "$D4" | jq -r '.pendingTrade.bookId')"
check "次求购候选数降为3(bookA/bookB均已预约,初始5)" 3 "$(echo "$D4" | jq -r '.candidateCount')"
# 交易详情双方可见
check "买家可查交易" 200 "$(code GET "/trades/$TRADE" "$BTOK")"
check "卖家可查交易" 200 "$(code GET "/trades/$TRADE" "$STOK")"
check "无关用户不可查(403)" 403 "$(code GET "/trades/$TRADE" "$B2TOK")"

echo "================ 9. 权限：拒绝/取消角色校验 ================"
check "买家不能拒绝(403)" 403 "$(code POST "/trades/$TRADE/reject" "$BTOK")"
check "卖家不能取消(403)" 403 "$(code POST "/trades/$TRADE/cancel" "$STOK")"
check "有进行中交易时卖家不能手动改状态(409)" 409 "$(code PUT "/books/$BOOKA/status" "$STOK" '{"status":"available"}')"
check "有进行中交易不能关闭求购单(409)" 409 "$(code PUT "/purchase-requests/$REQ/close" "$BTOK")"

echo "================ 10. 卖家拒绝 -> 书释放 -> 可被重新匹配 ================"
check "卖家拒绝成功" 200 "$(code POST "/trades/$TRADE/reject" "$STOK")"
check "拒绝后交易状态=rejected" rejected "$(api GET "/trades/$TRADE" "$BTOK" | jq -r '.status')"
check "书A恢复available" available "$(api GET "/books/$BOOKA" | jq -r '.status')"
D5=$(api GET "/purchase-requests/$REQ" "$BTOK")
check "主求购 pendingTrade 已清空" null "$(echo "$D5" | jq -r '.pendingTrade')"
# bookA 已释放，但 bookB 仍被次求购预约，故主求购候选为 A/C/Pricy 共3
check "主求购候选数恢复为3(bookA释放,bookB仍预约)" 3 "$(echo "$D5" | jq -r '.candidateCount')"
if echo "$D5" | jq -e --arg id "$BOOKA" '.candidateBooks[]|select(.id==$id)' >/dev/null; then ok "释放后 bookA 重新出现在候选"; else bad "释放后 bookA 未重新匹配"; fi
# 买家2 用其另一条空闲求购单(reqNoPrice)立刻抢被释放的 bookA（证明其他求购单可重新匹配）
R=$(api POST "/purchase-requests/$REQNP/select" "$B2TOK" "{\"bookId\":\"$BOOKA\"}")
check "其他求购单成功预约被释放的书" "预约成功，已生成交易记录" "$(echo "$R" | jq -r '.message')"
TRADE_A2=$(echo "$R" | jq -r '.trade.id')
check "书A再次 reserved" reserved "$(api GET "/books/$BOOKA" | jq -r '.status')"
# 同一求购单不能同时选定两本书：买家2再用 reqNoPrice 选 bookC 应被拒
check "同一求购单重复选另一本被拒(409)" 409 "$(code POST "/purchase-requests/$REQNP/select" "$B2TOK" "{\"bookId\":\"$BOOKC\"}")"

echo "================ 11. 买家取消 -> 书释放 -> 可被重新匹配 ================"
check "买家2取消成功" 200 "$(code POST "/trades/$TRADE_A2/cancel" "$B2TOK")"
check "取消后交易状态=cancelled" cancelled "$(api GET "/trades/$TRADE_A2" "$B2TOK" | jq -r '.status')"
check "cancelledBy=buyer" buyer "$(api GET "/trades/$TRADE_A2" "$B2TOK" | jq -r '.cancelledBy')"
check "书A恢复available" available "$(api GET "/books/$BOOKA" | jq -r '.status')"
# 买家1 重新选回 bookA
R2=$(api POST "/purchase-requests/$REQ/select" "$BTOK" "{\"bookId\":\"$BOOKA\"}")
check "买家1可再次预约被取消释放的书" "预约成功，已生成交易记录" "$(echo "$R2" | jq -r '.message')"
TRADE_A3=$(echo "$R2" | jq -r '.trade.id')
# 历史交易保留(可追溯)，但只有最新一笔 pending
PEND=$(M2=/tmp/mysqlportable/mysql/bin/mysql; $M2 -h127.0.0.1 -uroot campus_bookstore -N -e "SELECT COUNT(*) FROM trades WHERE bookId='$BOOKA' AND status='pending';")
check "bookA 仅1笔pending(历史rejected/cancelled保留)" 1 "$PEND"
TOTAL=$(M2=/tmp/mysqlportable/mysql/bin/mysql; $M2 -h127.0.0.1 -uroot campus_bookstore -N -e "SELECT COUNT(*) FROM trades WHERE bookId='$BOOKA';")
check "bookA 历史交易共3条(可追溯)" 3 "$TOTAL"

echo "================ 12. 完成交易：书售出，不再释放 ================"
check "卖家确认成交" 200 "$(code POST "/trades/$TRADE_A3/complete" "$STOK")"
check "交易状态=completed" completed "$(api GET "/trades/$TRADE_A3" "$BTOK" | jq -r '.status')"
check "书A变为sold" sold "$(api GET "/books/$BOOKA" | jq -r '.status')"
# 已成交不能重复操作
check "已完成不能再取消(409)" 409 "$(code POST "/trades/$TRADE_A3/cancel" "$BTOK")"
check "已完成不能再拒绝(409)" 409 "$(code POST "/trades/$TRADE_A3/reject" "$STOK")"
# sold 书不再是候选（bookB 仍预约，故仅剩 C/Pricy 共2）
D6=$(api GET "/purchase-requests/$REQ" "$BTOK")
if echo "$D6" | jq -e --arg id "$BOOKA" '.candidateBooks[]|select(.id==$id)' >/dev/null; then bad "已售书不应是候选"; else ok "已售 bookA 不在候选"; fi
check "主求购候选数=2(bookA售出,bookB预约)" 2 "$(echo "$D6" | jq -r '.candidateCount')"
# 完成后可关闭求购单
check "完成后可关闭求购单" 200 "$(code PUT "/purchase-requests/$REQ/close" "$BTOK")"

echo "================ 13. 交易列表 ================"
# 买家1：reject、cancel(无关) ... 实际为 bookA 的 rejected + completed = 2 笔（bookA历史去重）
check "买家1交易数=2(rejected+completed)" 2 "$(api GET '/my/trades?role=buyer' "$BTOK" | jq -r '.trades|length')"
# 买家2：bookB pending + bookA cancelled = 2
check "买家2交易数=2(pending+cancelled)" 2 "$(api GET '/my/trades?role=buyer' "$B2TOK" | jq -r '.trades|length')"
check "卖家卖出的包含bookA/bookB" "true" "$(api GET '/my/trades?role=seller' "$STOK" | jq -r '[.trades[].bookId]|index("'$BOOKA'")!=null')"
check "卖出交易带role=seller" seller "$(api GET '/my/trades?role=seller' "$STOK" | jq -r '.trades[0].role')"
# 状态过滤
check "按status=pending过滤" 1 "$(api GET '/my/trades?role=buyer&status=pending' "$B2TOK" | jq -r '.trades|length')"

echo
echo "================ 结果：通过 $PASS，失败 $FAIL ================"
[ "$FAIL" -eq 0 ]
