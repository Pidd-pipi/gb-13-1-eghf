<template>
  <div class="detail-page">
    <van-nav-bar title="求购单详情" left-arrow @click-left="router.back" />

    <van-loading v-if="loading" class="loading-center" />

    <template v-else-if="detail">
      <!-- 求购信息 -->
      <div class="section">
        <div class="req-header">
          <div class="req-title">{{ detail.bookTitle }}</div>
          <van-tag v-if="detail.status === 'active'" type="primary">求购中</van-tag>
          <van-tag v-else type="default">已关闭</van-tag>
        </div>
        <div class="tag-row">
          <van-tag plain type="primary">课程 {{ detail.courseCode }}</van-tag>
          <van-tag plain type="primary">{{ detail.edition }}</van-tag>
          <van-tag plain type="default">{{ detail.campus }}</van-tag>
          <van-tag plain type="default">{{ categoryMap[detail.category] }}</van-tag>
        </div>
        <div class="meta-grid">
          <div class="meta-item" v-if="detail.author">作者：{{ detail.author }}</div>
          <div class="meta-item" v-if="detail.isbn">ISBN：{{ detail.isbn }}</div>
          <div class="meta-item" v-if="detail.expectedPrice">
            期望价：<span class="price">¥{{ detail.expectedPrice }}</span>
          </div>
          <div class="meta-item" v-if="detail.conditions?.length">
            新旧要求：{{ detail.conditions.map((c) => conditionMap[c as BookCondition]).join('、') }}
          </div>
        </div>
        <div class="desc" v-if="detail.description">{{ detail.description }}</div>

        <div class="requester" v-if="detail.requester">
          <van-icon name="user-o" size="13" />
          <span>{{ detail.requester.name || detail.requester.department || '匿名同学' }}</span>
        </div>
      </div>

      <!-- 买家视角：候选书籍 -->
      <div v-if="isOwner" class="section">
        <div class="section-head">
          <h3>同版匹配书籍</h3>
          <van-tag :type="detail.candidateCount ? 'primary' : 'default'">
            剩余候选 {{ detail.candidateCount ?? 0 }}
          </van-tag>
        </div>

        <!-- 已预约提示 -->
        <van-notice-bar
          v-if="detail.pendingTrade"
          left-icon="info-o"
          text="你已选定一本书并预约成功，等待交易完成。重复选择不会重复预约。"
        />

        <div v-if="candidateBooks.length" class="candidate-list">
          <div v-for="book in candidateBooks" :key="book.id" class="candidate">
            <van-image
              :src="book.images[0]"
              width="72"
              height="72"
              fit="cover"
              radius="6"
              @click="goBook(book.id)"
            />
            <div class="candidate-info" @click="goBook(book.id)">
              <div class="candidate-title">{{ book.title }}</div>
              <div class="candidate-tags">
                <van-tag plain type="primary">{{ book.courseCode }}</van-tag>
                <van-tag plain type="primary">{{ book.edition }}</van-tag>
                <van-tag plain type="success">{{ conditionMap[book.condition] }}</van-tag>
              </div>
              <!-- 匹配原因 -->
              <div class="match-reason">
                <van-icon name="success" color="#07c160" size="12" />
                <span>{{ reasonFor(book).summary }}</span>
              </div>
              <div class="candidate-price">
                ¥{{ book.price }} · {{ book.campus }}
                <van-tag
                  v-if="detail.expectedPrice && Number(book.price) > Number(detail.expectedPrice)"
                  plain
                  type="warning"
                >
                  高于期望价 ¥{{ detail.expectedPrice }}
                </van-tag>
              </div>
            </div>
            <div class="candidate-action">
              <van-button
                v-if="isSelected(book.id)"
                size="small"
                type="primary"
                plain
                disabled
              >
                已预约
              </van-button>
              <van-button
                v-else-if="detail.pendingTrade"
                size="small"
                type="primary"
                disabled
              >
                已选其他
              </van-button>
              <van-button
                v-else
                size="small"
                type="primary"
                :loading="selectingId === book.id"
                @click="onSelect(book)"
              >
                选定此书
              </van-button>
            </div>
          </div>
        </div>
        <van-empty v-else description="暂无可购买的同版书籍，发布新书后会自动出现在这里" />
      </div>

      <!-- 非买家（如卖家）视角：展示该书与求购单匹配原因（query.bookId 时） -->
      <div v-else-if="detail.matchReason" class="section">
        <h3>匹配情况</h3>
        <div class="reason-box" :class="{ ok: detail.matchReason.matched }">
          <van-icon
            :name="detail.matchReason.matched ? 'passed' : 'close'"
            :color="detail.matchReason.matched ? '#07c160' : '#ee0a24'"
          />
          <span>{{ detail.matchReason.summary }}</span>
        </div>
      </div>

      <!-- 求购者本人：进行中的交易入口 -->
      <div v-if="isOwner && detail.pendingTrade" class="section">
        <van-button block round type="primary" @click="goTrade(detail.pendingTrade!.id)">
          查看交易记录
        </van-button>
      </div>

      <!-- 求购者本人：关闭求购单 -->
      <div v-if="isOwner && detail.status === 'active' && !detail.pendingTrade" class="section">
        <van-button block round plain type="danger" @click="onClose">关闭求购单</van-button>
      </div>
    </template>

    <van-empty v-else description="求购单不存在" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showConfirmDialog } from 'vant';
import { getPurchaseRequestById, selectBookForRequest, closePurchaseRequest } from '@/api/purchase';
import { buildReason } from './reason';
import { useAuthStore } from '@/store/auth';
import type { Book, BookCondition, PurchaseRequest } from '@/types';
import { categoryMap, conditionMap } from '@/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const detail = ref<PurchaseRequest | null>(null);
const selectingId = ref<string | null>(null);

const isOwner = computed(() => detail.value?.requesterId === authStore.user?.id);
const candidateBooks = computed<Book[]>(() => detail.value?.candidateBooks ?? []);

const reasonFor = (book: Book) =>
  buildReason(
    { campus: detail.value!.campus, courseCode: detail.value!.courseCode, edition: detail.value!.edition },
    { campus: book.campus, courseCode: book.courseCode, edition: book.edition },
  );

const isSelected = (bookId: string) => detail.value?.pendingTrade?.bookId === bookId;

const fetchDetail = async () => {
  loading.value = true;
  try {
    detail.value = await getPurchaseRequestById(route.params.id as string);
  } finally {
    loading.value = false;
  }
};

const goBook = (id: string) => {
  router.push(`/book/${id}?requestId=${route.params.id}`);
};

const goTrade = (id: string) => {
  router.push(`/trade/${id}`);
};

const onSelect = async (book: Book) => {
  try {
    await showConfirmDialog({
      title: '选定此书',
      message: `确认预约《${book.title}》（${book.courseCode} ${book.edition}）？预约后该书将被锁定。`,
    });
  } catch {
    return;
  }
  selectingId.value = book.id;
  try {
    const res = await selectBookForRequest(route.params.id as string, book.id);
    showToast(res.alreadySelected ? '你已预约该书，请勿重复选择' : '预约成功，已生成交易记录');
    await fetchDetail();
  } catch {
    // 失败提示已由拦截器统一弹出（如并发被抢）
    await fetchDetail();
  } finally {
    selectingId.value = null;
  }
};

const onClose = async () => {
  try {
    await showConfirmDialog({ title: '关闭求购单', message: '关闭后不再参与匹配，确定关闭吗？' });
    await closePurchaseRequest(route.params.id as string);
    showToast('已关闭');
    router.back();
  } catch {
    // 取消
  }
};

onMounted(fetchDetail);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.section {
  background: white;
  margin: 12px;
  border-radius: 8px;
  padding: 16px;
}
.req-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.req-title {
  font-size: 18px;
  font-weight: 600;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.meta-grid {
  margin-top: 10px;
}
.meta-item {
  font-size: 13px;
  color: #666;
  margin-top: 6px;
}
.meta-item .price {
  color: #ee0a24;
  font-weight: 600;
}
.desc {
  margin-top: 10px;
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}
.requester {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 12px;
  color: #999;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-head h3 {
  font-size: 15px;
  margin: 0;
}
.candidate {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #f5f5f5;
}
.candidate:last-child {
  border-bottom: none;
}
.candidate-info {
  flex: 1;
  min-width: 0;
}
.candidate-title {
  font-size: 14px;
  font-weight: 500;
}
.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.match-reason {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  color: #07c160;
  line-height: 1.4;
}
.candidate-price {
  margin-top: 6px;
  font-size: 13px;
  color: #ee0a24;
  font-weight: 600;
}
.candidate-action {
  display: flex;
  align-items: center;
}
.reason-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 6px;
  background: #fff1f0;
  color: #ee0a24;
  font-size: 13px;
}
.reason-box.ok {
  background: #f0fff4;
  color: #07c160;
}
</style>
