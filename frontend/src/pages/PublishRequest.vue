<template>
  <div class="page-container">
    <van-nav-bar title="发布求购" left-arrow @click-left="router.back" />

    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field
          v-model="form.bookTitle"
          label="书名"
          placeholder="需要哪本教材"
          :rules="[{ required: true, message: '请填写书名' }]"
        />
        <van-field v-model="form.author" label="作者" placeholder="选填" />
        <van-field v-model="form.isbn" label="ISBN" placeholder="选填" />

        <van-field name="campus" label="校区" placeholder="请选择校区" :rules="[{ required: true, message: '请选择校区' }]">
          <template #input>
            <van-picker
              :columns="campusOptions"
              @confirm="onCampusConfirm"
              v-model:show="showCampusPicker"
            >
              <template #title>选择校区</template>
            </van-picker>
            <div @click="showCampusPicker = true">{{ form.campus || '请选择' }}</div>
          </template>
        </van-field>

        <van-field
          v-model="form.courseCode"
          label="课程代码"
          placeholder="如 CS101"
          :rules="[{ required: true, message: '请填写课程代码' }]"
        />
        <van-field
          v-model="form.edition"
          label="版次"
          placeholder="如 第3版"
          :rules="[{ required: true, message: '请填写版次' }]"
        />
        <div class="match-tip">
          <van-icon name="info-o" />
          系统只会为你匹配「同校区 + 同课程代码 + 同版次」且当前可购买的教材
        </div>

        <van-field v-model.number="form.expectedPrice" type="number" label="期望价格" placeholder="选填，¥">
          <template #left-icon>
            <van-icon name="balance-o" />
          </template>
        </van-field>

        <van-field name="conditions" label="新旧要求">
          <template #input>
            <van-checkbox-group v-model="form.conditions" direction="horizontal">
              <van-checkbox name="new" shape="square">全新</van-checkbox>
              <van-checkbox name="like_new" shape="square">九成新</van-checkbox>
              <van-checkbox name="good" shape="square">七成新</van-checkbox>
              <van-checkbox name="fair" shape="square">五成新</van-checkbox>
            </van-checkbox-group>
          </template>
        </van-field>

        <van-field name="category" label="分类" :rules="[{ required: true, message: '请选择分类' }]">
          <template #input>
            <van-radio-group v-model="form.category" direction="horizontal">
              <van-radio name="science">理工</van-radio>
              <van-radio name="humanities">文史</van-radio>
              <van-radio name="business">经管</van-radio>
              <van-radio name="arts">艺术</van-radio>
              <van-radio name="other">其他</van-radio>
            </van-radio-group>
          </template>
        </van-field>

        <van-field
          v-model="form.description"
          label="备注"
          type="textarea"
          placeholder="其他要求，选填"
          rows="3"
        />
      </van-cell-group>

      <div class="submit-actions">
        <van-button round block type="primary" native-type="submit" :loading="loading">
          发布求购
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast } from 'vant';
import { createPurchaseRequest } from '@/api/purchase';
import { campusOptions } from '@/constants';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const showCampusPicker = ref(false);

// 支持从书籍详情页带入同版教材信息预填
const query = route.query;
const form = reactive({
  bookTitle: (query.bookTitle as string) || '',
  author: (query.author as string) || '',
  isbn: '',
  campus: (query.campus as string) || '',
  courseCode: (query.courseCode as string) || '',
  edition: (query.edition as string) || '',
  expectedPrice: undefined as number | undefined,
  conditions: [] as string[],
  category: '',
  description: '',
});

const onCampusConfirm = ({ selectedOptions }: any) => {
  form.campus = selectedOptions[0]?.text || '';
  showCampusPicker.value = false;
};

const onSubmit = async () => {
  loading.value = true;
  try {
    await createPurchaseRequest({
      bookTitle: form.bookTitle.trim(),
      author: form.author || undefined,
      isbn: form.isbn || undefined,
      expectedPrice: form.expectedPrice,
      conditions: form.conditions,
      category: (form.category || 'other') as any,
      campus: form.campus,
      courseCode: form.courseCode.trim().toUpperCase(),
      edition: form.edition.trim(),
      description: form.description || undefined,
    });
    showToast('求购发布成功');
    router.replace('/my-purchase-requests');
  } catch {
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.submit-actions {
  padding: 24px;
}
.match-tip {
  margin: 8px 16px 0;
  padding: 8px 12px;
  font-size: 12px;
  color: #1989fa;
  background: #ecf5ff;
  border-radius: 6px;
  line-height: 1.6;
}
.match-tip .van-icon {
  margin-right: 4px;
  vertical-align: -1px;
}
</style>
