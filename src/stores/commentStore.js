import { defineStore } from 'pinia'
import { useRecipeStore } from './recipeStore'

function normalizeComment(comment) {
  return {
    ...comment,
    user_id: comment.user_id ?? comment.userId,
    recipe_id: comment.recipe_id ?? comment.recipeId,
    created_at: comment.created_at ?? comment.createdAt,
    updated_at: comment.updated_at ?? comment.updatedAt ?? comment.createdAt,
  }
}

export const useCommentStore = defineStore('comments', {
  state: () => ({
    comments: [],
  }),
  actions: {
    addCommentFromSocket(comment) {
      const normalizedComment = normalizeComment(comment)
      if (this.comments.find((item) => item.id === normalizedComment.id)) {
        return
      }

      this.comments.push(normalizedComment)
      useRecipeStore().addCommentFromSocket(normalizedComment)
    },
  },
})
