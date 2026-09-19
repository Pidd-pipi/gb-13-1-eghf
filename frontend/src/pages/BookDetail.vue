<template>
  <div class="detail-page">
    <van-nav-bar title="书籍详情" left-arrow @click-left="router.back" />
    
    <van-loading v-if="loading" class="loading-center" />
    
    <div v-else-if="book">
      <van-swipe class="detail-images" :autoplay="3000" indicator-color="white">
        <van-swipe-item v-for="(image, index) in book.images" :key="index">
          <van-image :src="image" fit="cover" width="100%" height="300px" />
        </van-swipe-item>
      </van-swipe>
      
      <div class="detail-header">
        <div class="detail-title">{{ book.title }}</div>
        <div class="detail-price-section">
          <span class="detail-price">¥{{ book.price }}</span>
          <span class="detail-original-price">¥{{ book.originalPrice }}</span>
          <van-tag :class="`status-${book.status}`" type="success" v-if="book.status === 'available'">可购买</van-tag>
          <van-tag v-else-if="book.status === 'reserved'" type="warning">已预约</van-tag>
          <van-tag v-else type="default">已售出</van-tag>
        </div>
        
        <div class="detail-meta">
          <span class="detail-meta-item">作者：{{ book.author }}</span>
          <span class="detail-meta-item">新旧：{{ conditionMap[book.condition] }}</span>
          <span class="detail-meta-item">分类：{{ categoryMap[book.category] }}</span>
          <span class="detail-meta-item">交易：{{ tradeMethodMap[book.tradeMethod] }}</span>
          <span class="detail-meta-item">校区：{{ book.campus }}</span>
          <span class="detail-meta-item match">课程代码：{{ book.courseCode }}</span>
          <span class="detail-meta-item match">版次：{{ book.edition }}</span>
          <span v-if="book.isbn" class="detail-meta-item">ISBN：{{ book.isbn }}</span>
        </div>

        <div class="detail-desc" v-if="book.description">
          <h4>描述</h4>
          <p>{{ book.description }}</p>
        </div>
      </div>

      <!-- 同版匹配：哪些求购单会匹配到本书及匹配原因 -->
      <div class="match-section">
        <div class="match-section-head">
          <span>同版求购匹配</span>
          <van-tag type="primary" round>{{ book.matchingRequestCount ?? 0 }}</van-tag>
        </div>
        <van-empty
          v-if="!book.matchingRequests || book.matchingRequests.length === 0"
          image-size="80"
          description="暂无需同校区/同课程代码/同版次教材的求购单"
        />
        <div v-else class="match-request-list">
          <div v-for="mr in book.matchingRequests" :key="mr.id" class="match-request">
            <div class="match-request-title">
              <van-icon name="notes-o" />
              {{ mr.bookTitle }}
              <span class="match-request-user">（{{ mr.requesterName }} 求购）</span>
            </div>
            <div v-for="(reason, i) in mr.reasons" :key="i" class="match-reason-line">
              <van-icon name="success" color="#07c160" size="12" />
              <span>{{ reason }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 卖家视角：该书存在待处理预约时直达交易记录 -->
      <div v-if="isOwner && book.status === 'reserved'" class="owner-reserved-tip" @click="router.push('/transactions')">
        <van-icon name="clock-o" color="#fa8c16" />
        该书已被买家预约，点击前往交易记录处理（接受/拒绝）
        <van-icon name="arrow" />
      </div>
      
      <div class="detail-seller" v-if="book.seller">
        <van-image
          round
          width="48"
          height="48"
          :src="book.seller.avatarUrl || 'https://img.yzcdn.cn/vant/user-inactive.png'"
        />
        <div class="seller-detail">
          <div class="seller-name">
            {{ book.seller.name || '匿名用户' }}
            <span v-if="book.seller.positiveRatingRate < 60" class="risk-badge">风险提示</span>
          </div>
          <div class="seller-department">
            {{ book.seller.department || '未填写院系' }}
            <span class="rating-badge" v-if="book.seller.totalReviews > 0">
              好评率 {{ book.seller.positiveRatingRate }}%
            </span>
          </div>
        </div>
        <van-button type="primary" size="small" round @click="viewReviews">评价({{ book.seller.totalReviews }})</van-button>
      </div>
      
      <div class="bottom-actions">
        <van-button icon="star-o" :type="isFavorite ? 'warning' : 'default'" @click="toggleFavorite">
          {{ isFavorite ? '已收藏' : '收藏' }}
        </van-button>
        <van-button
          v-if="isOwner && book.status === 'reserved'"
          type="warning"
          block
          @click="router.push('/transactions')"
        >
          处理预约
        </van-button>
        <van-button
          v-else
          type="primary"
          block
          :disabled="book.status !== 'available' || isOwner"
          @click="contactSeller"
        >
          {{ isOwner ? '这是我发布的' : book.status === 'sold' ? '已售出' : '我要求购同版教材' }}
        </van-button>
      </div>
    </div>
    
    <van-empty v-else description="书籍不存在" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast, showDialog } from 'vant';
import { getBookById, toggleFavorite as apiToggleFavorite } from '@/api/book';
import { useAuthStore } from '@/store/auth';
import type { Book } from '@/types';
import { conditionMap, categoryMap, tradeMethodMap } from '@/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const book = ref<Book | null>(null);
const isFavorite = ref(false);

const isOwner = computed(() => {
  return book.value?.sellerId === authStore.user?.id;
});

const fetchBook = async () => {
  loading.value = true;
  try {
    book.value = await getBookById(route.params.id as string);
  } finally {
    loading.value = false;
  }
};

const toggleFavorite = async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  try {
    const result = await apiToggleFavorite(book.value!.id);
    isFavorite.value = result.isFavorite;
    showToast(result.isFavorite ? '收藏成功' : '已取消收藏');
  } catch {}
};

const contactSeller = () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  if (!book.value) return;
  // 买家通过发布同版求购单进入匹配闭环，发布后系统会自动匹配这本书
  const b = book.value;
  router.push({
    path: '/publish-request',
    query: {
      bookTitle: b.title,
      author: b.author,
      campus: b.campus,
      courseCode: b.courseCode,
      edition: b.edition,
    },
  });
};

const viewReviews = () => {
  if (!book.value?.seller) return;
  showDialog({
    title: '卖家评价',
    message: '请在个人中心查看更多评价功能',
  });
};

onMounted(fetchBook);
</script>

<style scoped>
.loading-center {
  display: flex;
  justify-content: center;
  padding: 100px;
}
.detail-images {
  width: 100%;
  height: 300px;
}
.detail-header {
  padding: 16px;
}
.detail-title {
  font-size: 18px;
  font-weight: 500;
  color: #1a1a1a;
}
.detail-price-section {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.detail-price {
  font-size: 24px;
  font-weight: bold;
  color: #ff4d4f;
}
.detail-original-price {
  font-size: 14px;
  color: #999;
  text-decoration: line-through;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.detail-meta-item {
  font-size: 13px;
  color: #666;
  background: #f7f8fa;
  padding: 4px 8px;
  border-radius: 4px;
}
.detail-desc {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.detail-desc h4 {
  font-size: 14px;
  color: #1a1a1a;
  margin-bottom: 8px;
}
.detail-desc p {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
}
.detail-seller {
  display: flex;
  align-items: center;
  padding: 16px;
  border-top: 8px solid #f7f8fa;
}
.seller-detail {
  flex: 1;
  margin-left: 12px;
}
.seller-name {
  font-size: 15px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}
.risk-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: #fff1f0;
  color: #f5222d;
  border-radius: 4px;
}
.seller-department {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rating-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  background: #fff7e6;
  color: #fa8c16;
}
.status-available {
  background: #52c41a !important;
}
.status-reserved {
  background: #faad14 !important;
}
.status-sold {
  background: #d9d9d9 !important;
}
.detail-meta-item.match {
  background: #f4f0ff;
  color: #722ed1;
}
.match-section {
  background: white;
  margin-top: 8px;
  padding: 16px;
}
.match-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 500;
}
.match-request-list {
  margin-top: 12px;
}
.match-request {
  padding: 10px;
  background: #faf8ff;
  border-radius: 6px;
  margin-bottom: 10px;
}
.match-request-title {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}
.match-request-user {
  color: #999;
  font-weight: 400;
}
.match-reason-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 12px;
  color: #555;
  line-height: 1.7;
  margin-top: 2px;
}
.match-reason-line .van-icon {
  margin-top: 3px;
}
.owner-reserved-tip {
  margin: 8px 12px 80px;
  padding: 12px;
  background: #fff7e8;
  border: 1px solid #ffd591;
  border-radius: 8px;
  font-size: 13px;
  color: #d46b08;
  display: flex;
  align-items: center;
  gap: 6px;
}
.detail-page:not(:has(.owner-reserved-tip)) {
  padding-bottom: 72px;
}
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: white;
  display: flex;
  gap: 12px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}
</style>
