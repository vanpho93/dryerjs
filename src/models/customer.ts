import * as graphql from 'graphql';
import {
  Definition,
  Thunk,
  Filterable,
  allOperators,
  Sortable,
  ObjectId,
  Property,
  Id,
  GraphQLObjectId,
  Index,
  AfterCreate,
  AfterCreateHookInput,
} from 'dryerjs';
import { IsEmail } from 'class-validator';
import { Injectable } from '@nestjs/common';

@Index({ name: 'text' })
@Definition({
  allowedApis: '*',
  enableTextSearch: true,
})
export class Customer {
  @Filterable(() => GraphQLObjectId, { operators: allOperators })
  @Sortable()
  @Id()
  id: ObjectId;

  @Filterable(() => graphql.GraphQLString, { operators: allOperators })
  @Sortable()
  @Property()
  name: string;

  @Thunk(IsEmail, { scopes: ['input'] })
  @Filterable(() => graphql.GraphQLString, { operators: allOperators })
  @Sortable()
  @Property({ nullable: true, db: { unique: true } })
  email: string;

  @Filterable(() => graphql.GraphQLInt, { operators: allOperators })
  @Property({ nullable: true })
  numberOfOrders?: number;

  @Filterable(() => GraphQLObjectId, { operators: allOperators })
  @Property({ type: () => GraphQLObjectId, nullable: true })
  countryId: ObjectId;
}

@Injectable()
export class CustomerService {
  @AfterCreate(() => Customer)
  welcome(input: AfterCreateHookInput<Customer>) {
    console.log('welcome', input.created.id);
  }
}
